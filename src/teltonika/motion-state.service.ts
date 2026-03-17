import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cron } from '@nestjs/schedule';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { cars, carStopEvents } from '@/shared/database/schema';
import { and, eq, gte, isNull } from 'drizzle-orm';
import { GpsRecord } from './codec8.parser';
import {
  MOTION,
  MotionState,
  StopPoint,
} from './motion-state.constants';
import { TrackingGateway } from '@/shared/gateway/tracking.gateway';

const ACTIVE_CARS_KEY = 'motion:active';

@Injectable()
export class MotionStateService {
  private readonly logger = new Logger('MotionState');

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    @InjectDb() private db: DataSource,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  // ─── Helpers ───

  private redisKey(carId: number): string {
    return `${MOTION.REDIS_PREFIX}:${carId}`;
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Nuqtalar arrayidan centroid (o'rtacha) hisoblash */
  private computeCentroid(points: StopPoint[]): { lat: number; lng: number } {
    if (points.length === 0) return { lat: 0, lng: 0 };
    const sum = points.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 },
    );
    return {
      lat: sum.lat / points.length,
      lng: sum.lng / points.length,
    };
  }

  /** GPS nuqta ishonchli yoki yo'qligini tekshirish */
  private isReliablePoint(
    record: GpsRecord,
    lastLat: number,
    lastLng: number,
  ): boolean {
    // Tezlik tekshirish
    if ((record.speed ?? 0) > MOTION.MAX_SPEED) return false;

    // Satellite soni tekshirish — kam bo'lsa GPS signal yomon
    if (record.satellites < MOTION.MIN_SATELLITES) return false;

    // HDOP tekshirish — yuqori bo'lsa GPS aniqlik past
    if (record.io.hdop !== null && record.io.hdop > MOTION.MAX_HDOP) return false;

    // Masofa sakrash tekshirish (faqat avvalgi nuqta mavjud bo'lsa)
    if (lastLat !== 0 && lastLng !== 0) {
      const distance = this.calculateDistance(
        lastLat,
        lastLng,
        record.lat,
        record.lng,
      );
      if (distance > MOTION.GPS_JUMP_THRESHOLD) return false;
    }

    return true;
  }

  /** Stop nuqtalarini qo'shish (max limitdan oshmasin) */
  private addStopPoint(
    points: StopPoint[],
    record: GpsRecord,
  ): StopPoint[] {
    const newPoints = [
      ...points,
      {
        lat: record.lat,
        lng: record.lng,
        recordedAt: new Date(record.timestamp).toISOString(),
      },
    ];
    // MAX limitdan oshsa — eskisini olib tashlash
    if (newPoints.length > MOTION.MAX_STOP_POINTS) {
      return newPoints.slice(-MOTION.MAX_STOP_POINTS);
    }
    return newPoints;
  }

  // ─── Redis ───

  async getState(carId: number): Promise<MotionState | null> {
    const raw: unknown = await this.cache.get(this.redisKey(carId));
    if (!raw) return null;

    let data: unknown = raw;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }

    if (typeof data === 'object' && data !== null && 'value' in data) {
      const inner = (data as { value: unknown }).value;
      if (typeof inner === 'string') {
        try {
          data = JSON.parse(inner);
        } catch {
          return null;
        }
      } else {
        data = inner;
      }
    }

    if (
      typeof data === 'object' &&
      data !== null &&
      'status' in data &&
      'since' in data
    ) {
      const state = data as MotionState;
      // Backward compatibility: eski state'larda yangi fieldlar yo'q
      if (state.lastLat === undefined) state.lastLat = state.lat;
      if (state.lastLng === undefined) state.lastLng = state.lng;
      if (!Array.isArray(state.points)) state.points = [];
      return state;
    }

    return null;
  }

  private async setState(carId: number, state: MotionState): Promise<void> {
    await this.cache.set(this.redisKey(carId), state, 0);
  }

  // ─── Active cars list ───

  private async getActiveCars(): Promise<number[]> {
    const raw: unknown = await this.cache.get(ACTIVE_CARS_KEY);
    if (!raw) return [];

    let data: unknown = raw;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return [];
      }
    }

    if (typeof data === 'object' && data !== null && 'value' in data) {
      const inner = (data as { value: unknown }).value;
      if (typeof inner === 'string') {
        try {
          data = JSON.parse(inner);
        } catch {
          return [];
        }
      } else {
        data = inner;
      }
    }

    if (Array.isArray(data)) {
      return data as number[];
    }

    return [];
  }

  private async addActiveCar(carId: number): Promise<void> {
    const activeCars = await this.getActiveCars();
    if (!activeCars.includes(carId)) {
      activeCars.push(carId);
      await this.cache.set(ACTIVE_CARS_KEY, activeCars, 0);
    }
  }

  // ─── DB ───

  private async getCarInfo(carId: number) {
    const result = await this.db
      .select({ name: cars.name, carNumber: cars.carNumber })
      .from(cars)
      .where(eq(cars.id, carId))
      .limit(1);
    return result[0] ?? null;
  }

  /** Dublikat tekshirish: oxirgi 60s ichida event bormi */
  private async hasDuplicateEvent(
    carId: number,
    type: 'stop' | 'parking',
    startAt: Date,
  ): Promise<boolean> {
    const threshold = new Date(startAt.getTime() - 60_000);
    const existing = await this.db
      .select({ id: carStopEvents.id })
      .from(carStopEvents)
      .where(
        and(
          eq(carStopEvents.carId, carId),
          eq(carStopEvents.type, type),
          gte(carStopEvents.startAt, threshold),
        ),
      )
      .limit(1);
    return existing.length > 0;
  }

  private async createEvent(
    carId: number,
    type: 'stop' | 'parking',
    startAt: Date,
    lat: number,
    lng: number,
  ): Promise<number> {
    // Dublikat tekshirish
    const isDuplicate = await this.hasDuplicateEvent(carId, type, startAt);
    if (isDuplicate) {
      this.logger.warn(
        `Dublikat ${type} event o'tkazib yuborildi: carId=${carId}`,
      );
      // Mavjud eventni qaytarish
      const existing = await this.db
        .select({ id: carStopEvents.id })
        .from(carStopEvents)
        .where(
          and(
            eq(carStopEvents.carId, carId),
            eq(carStopEvents.type, type),
            gte(carStopEvents.startAt, new Date(startAt.getTime() - 60_000)),
          ),
        )
        .limit(1);
      if (existing[0]) return existing[0].id;
    }

    // Ochiq eventlarni yopish
    const openEvents = await this.db
      .select({ id: carStopEvents.id, startAt: carStopEvents.startAt })
      .from(carStopEvents)
      .where(and(eq(carStopEvents.carId, carId), isNull(carStopEvents.endAt)));

    for (const open of openEvents) {
      await this.closeEvent(open.id, startAt, open.startAt);
      this.logger.warn(`Ochiq event yopildi: eventId=${open.id}`);
    }

    const [result] = await this.db
      .insert(carStopEvents)
      .values({ carId, type, startAt, latitude: lat, longitude: lng })
      .returning({ id: carStopEvents.id });

    this.logger.log(
      `${type.toUpperCase()} boshlandi: carId=${carId}, eventId=${result.id}`,
    );
    return result.id;
  }

  private async closeEvent(
    eventId: number,
    endAt: Date,
    startAt: Date,
  ): Promise<void> {
    const durationSeconds = Math.floor(
      (endAt.getTime() - startAt.getTime()) / 1000,
    );

    await this.db
      .update(carStopEvents)
      .set({ endAt, durationSeconds })
      .where(eq(carStopEvents.id, eventId));

    this.logger.log(
      `Event yopildi: eventId=${eventId}, duration=${durationSeconds}s`,
    );
  }

  /** Event koordinatasini centroid bilan yangilash */
  private async updateEventCoordinates(
    eventId: number,
    lat: number,
    lng: number,
  ): Promise<void> {
    await this.db
      .update(carStopEvents)
      .set({ latitude: lat, longitude: lng })
      .where(eq(carStopEvents.id, eventId));
  }

  // ─── State Machine ───

  private isMoving(state: MotionState, record: GpsRecord): boolean {
    const speed = record.speed ?? 0;

    if (speed > MOTION.SPEED_THRESHOLD) return true;

    // lastLat/lastLng ishlatish (stale koordinata muammosini hal qilish)
    const distance = this.calculateDistance(
      state.lastLat,
      state.lastLng,
      record.lat,
      record.lng,
    );

    if (distance > MOTION.DISTANCE_THRESHOLD) return true;

    return false;
  }

  private async transition(
    carId: number,
    state: MotionState,
    record: GpsRecord,
  ): Promise<MotionState> {
    const ignition = record.io.ignition;
    const recordTime = new Date(record.timestamp);
    const sinceTime = new Date(state.since);
    const elapsedSeconds = (recordTime.getTime() - sinceTime.getTime()) / 1000;

    // GPS ishonchlilik tekshirish
    if (!this.isReliablePoint(record, state.lastLat, state.lastLng)) {
      this.logger.debug(
        `GPS sakrash filtrlandi: carId=${carId}, speed=${record.speed}, ` +
          `lat=${record.lat}, lng=${record.lng}`,
      );
      return state; // ishonchsiz nuqtani o'tkazib yuborish
    }

    if (ignition === false) {
      return this.handleIgnitionOff(
        carId,
        state,
        record,
        recordTime,
        elapsedSeconds,
      );
    }

    const moving = this.isMoving(state, record);

    if (!moving) {
      return this.handleSlow(carId, state, record, recordTime, elapsedSeconds);
    } else {
      return this.handleMoving(carId, state, record, recordTime);
    }
  }

  private async handleIgnitionOff(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    recordTime: Date,
    elapsedSeconds: number,
  ): Promise<MotionState> {
    const { status } = state;

    // Parking da — nuqta qo'shish (centroid yangilanadi)
    if (status === 'parking') {
      const points = this.addStopPoint(state.points, record);
      const centroid = this.computeCentroid(points);
      if (state.eventId) {
        await this.updateEventCoordinates(state.eventId, centroid.lat, centroid.lng);
      }
      return {
        ...state,
        points,
        lat: centroid.lat,
        lng: centroid.lng,
        lastLat: record.lat,
        lastLng: record.lng,
      };
    }

    // Parking candidate — vaqt yetdimi tekshir
    if (status === 'parking_candidate') {
      const points = this.addStopPoint(state.points, record);
      const centroid = this.computeCentroid(points);

      if (elapsedSeconds >= MOTION.PARKING_THRESHOLD) {
        if (state.eventId) {
          await this.db
            .update(carStopEvents)
            .set({ type: 'parking', latitude: centroid.lat, longitude: centroid.lng })
            .where(eq(carStopEvents.id, state.eventId));

          this.logger.log(
            `Stop → Parking upgrade: carId=${carId}, eventId=${state.eventId}`,
          );

          return {
            status: 'parking',
            since: state.since,
            lat: centroid.lat,
            lng: centroid.lng,
            eventId: state.eventId,
            lastLat: record.lat,
            lastLng: record.lng,
            points,
          };
        }

        const eventId = await this.createEvent(
          carId,
          'parking',
          new Date(state.since),
          centroid.lat,
          centroid.lng,
        );
        return {
          status: 'parking',
          since: state.since,
          lat: centroid.lat,
          lng: centroid.lng,
          eventId,
          lastLat: record.lat,
          lastLng: record.lng,
          points,
        };
      }

      return {
        ...state,
        points,
        lat: centroid.lat,
        lng: centroid.lng,
        lastLat: record.lat,
        lastLng: record.lng,
      };
    }

    // Stopped da ignition off → parking_candidate ga o'tkazish
    if (status === 'stopped') {
      const points = this.addStopPoint(state.points, record);
      const centroid = this.computeCentroid(points);
      if (state.eventId) {
        await this.updateEventCoordinates(state.eventId, centroid.lat, centroid.lng);
      }
      return {
        status: 'parking_candidate',
        since: state.since,
        lat: centroid.lat,
        lng: centroid.lng,
        eventId: state.eventId,
        lastLat: record.lat,
        lastLng: record.lng,
        points,
      };
    }

    // Moving yoki stop_candidate → parking_candidate
    return {
      status: 'parking_candidate',
      since: recordTime.toISOString(),
      lat: state.lastLat, // oxirgi ishonchli koordinata
      lng: state.lastLng,
      eventId: null,
      lastLat: record.lat,
      lastLng: record.lng,
      points: [
        {
          lat: record.lat,
          lng: record.lng,
          recordedAt: recordTime.toISOString(),
        },
      ],
    };
  }

  private async handleSlow(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    recordTime: Date,
    elapsedSeconds: number,
  ): Promise<MotionState> {
    const { status } = state;

    // Stopped da — nuqtalar yig'ish, centroid yangilash
    if (status === 'stopped') {
      const points = this.addStopPoint(state.points, record);
      const centroid = this.computeCentroid(points);
      if (state.eventId) {
        await this.updateEventCoordinates(state.eventId, centroid.lat, centroid.lng);
      }
      return {
        ...state,
        points,
        lat: centroid.lat,
        lng: centroid.lng,
        lastLat: record.lat,
        lastLng: record.lng,
      };
    }

    // Parking da — nuqtalar yig'ish
    if (status === 'parking') {
      const points = this.addStopPoint(state.points, record);
      const centroid = this.computeCentroid(points);
      if (state.eventId) {
        await this.updateEventCoordinates(state.eventId, centroid.lat, centroid.lng);
      }
      return {
        ...state,
        points,
        lat: centroid.lat,
        lng: centroid.lng,
        lastLat: record.lat,
        lastLng: record.lng,
      };
    }

    if (status === 'stop_candidate') {
      const points = this.addStopPoint(state.points, record);
      const centroid = this.computeCentroid(points);

      if (elapsedSeconds >= MOTION.STOP_THRESHOLD) {
        const eventId = await this.createEvent(
          carId,
          'stop',
          new Date(state.since),
          centroid.lat,
          centroid.lng,
        );
        return {
          status: 'stopped',
          since: state.since,
          lat: centroid.lat,
          lng: centroid.lng,
          eventId,
          lastLat: record.lat,
          lastLng: record.lng,
          points,
        };
      }

      return {
        ...state,
        points,
        lat: centroid.lat,
        lng: centroid.lng,
        lastLat: record.lat,
        lastLng: record.lng,
      };
    }

    // parking_candidate da speed past → nuqta yig'ish
    if (status === 'parking_candidate') {
      const points = this.addStopPoint(state.points, record);
      const centroid = this.computeCentroid(points);
      return {
        ...state,
        points,
        lat: centroid.lat,
        lng: centroid.lng,
        lastLat: record.lat,
        lastLng: record.lng,
      };
    }

    // Moving → stop_candidate (lastLat ishlatish — stop_candidate boshlanish nuqtasi)
    return {
      status: 'stop_candidate',
      since: recordTime.toISOString(),
      lat: state.lastLat,
      lng: state.lastLng,
      eventId: null,
      lastLat: record.lat,
      lastLng: record.lng,
      points: [
        {
          lat: record.lat,
          lng: record.lng,
          recordedAt: recordTime.toISOString(),
        },
      ],
    };
  }

  private async handleMoving(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    recordTime: Date,
  ): Promise<MotionState> {
    const { status } = state;

    if (status === 'moving') {
      // lastLat/lastLng yangilash
      return {
        ...state,
        lastLat: record.lat,
        lastLng: record.lng,
      };
    }

    // Grace period: parking/stopped dan chiqishda tekshirish
    if (status === 'parking' || status === 'stopped') {
      const speed = record.speed ?? 0;
      const distance = this.calculateDistance(
        state.lastLat,
        state.lastLng,
        record.lat,
        record.lng,
      );

      // Speed < 20 va distance < 100m → jitter, davom etsin
      if (speed < 20 && distance < 100) {
        return {
          ...state,
          lastLat: record.lat,
          lastLng: record.lng,
        };
      }

      // Haqiqiy harakat — event yopiladi, oxirgi centroid saqlanadi
      if (state.eventId) {
        await this.closeEvent(state.eventId, recordTime, new Date(state.since));
      }
    }

    // parking_candidate / stop_candidate dan chiqish
    if (status === 'parking_candidate' || status === 'stop_candidate') {
      if (state.eventId) {
        await this.closeEvent(state.eventId, recordTime, new Date(state.since));
      }
    }

    return {
      status: 'moving',
      since: recordTime.toISOString(),
      lat: record.lat,
      lng: record.lng,
      eventId: null,
      lastLat: record.lat,
      lastLng: record.lng,
      points: [],
    };
  }

  // ─── Socket emit ───

  private async emitMotionState(carId: number, state: MotionState) {
    const car = await this.getCarInfo(carId);
    if (!car) return;

    this.trackingGateway.emitCarMotion({
      carId,
      carName: car.name,
      carNumber: car.carNumber,
      status: state.status,
      since: state.since,
      lat: state.lat,
      lng: state.lng,
    });
  }

  // ─── Cron: candidate timeout tekshirish ───

  @Cron('*/60 * * * * *')
  async checkCandidateTimeouts(): Promise<void> {
    const activeCars = await this.getActiveCars();
    if (activeCars.length === 0) return;

    const now = Date.now();

    for (const carId of activeCars) {
      try {
        const state = await this.getState(carId);
        if (!state) continue;

        const elapsedSeconds = (now - new Date(state.since).getTime()) / 1000;
        let newState: MotionState | null = null;

        if (
          state.status === 'parking_candidate' &&
          elapsedSeconds >= MOTION.PARKING_THRESHOLD
        ) {
          const centroid = this.computeCentroid(state.points);
          const lat = state.points.length > 0 ? centroid.lat : state.lat;
          const lng = state.points.length > 0 ? centroid.lng : state.lng;

          if (state.eventId) {
            await this.db
              .update(carStopEvents)
              .set({ type: 'parking', latitude: lat, longitude: lng })
              .where(eq(carStopEvents.id, state.eventId));

            this.logger.log(
              `Cron: Stop → Parking upgrade: carId=${carId}, eventId=${state.eventId}`,
            );

            newState = {
              status: 'parking',
              since: state.since,
              lat,
              lng,
              eventId: state.eventId,
              lastLat: state.lastLat,
              lastLng: state.lastLng,
              points: state.points,
            };
          } else {
            const eventId = await this.createEvent(
              carId,
              'parking',
              new Date(state.since),
              lat,
              lng,
            );
            newState = {
              status: 'parking',
              since: state.since,
              lat,
              lng,
              eventId,
              lastLat: state.lastLat,
              lastLng: state.lastLng,
              points: state.points,
            };
          }
        }

        if (
          state.status === 'stop_candidate' &&
          elapsedSeconds >= MOTION.STOP_THRESHOLD
        ) {
          const centroid = this.computeCentroid(state.points);
          const lat = state.points.length > 0 ? centroid.lat : state.lat;
          const lng = state.points.length > 0 ? centroid.lng : state.lng;

          const eventId = await this.createEvent(
            carId,
            'stop',
            new Date(state.since),
            lat,
            lng,
          );
          newState = {
            status: 'stopped',
            since: state.since,
            lat,
            lng,
            eventId,
            lastLat: state.lastLat,
            lastLng: state.lastLng,
            points: state.points,
          };
        }

        if (newState) {
          await this.setState(carId, newState);
          await this.emitMotionState(carId, newState);
          this.logger.log(
            `Cron: carId=${carId}, ${state.status} → ${newState.status}`,
          );
        }
      } catch (error) {
        this.logger.error(`Cron xato: carId=${carId}`, error);
      }
    }
  }

  // ─── Public API ───

  async processRecords(carId: number, records: GpsRecord[]): Promise<void> {
    await this.addActiveCar(carId);

    let state = await this.getState(carId);

    if (!state) {
      const first = records[0];
      state = {
        status: 'moving',
        since: new Date(first.timestamp).toISOString(),
        lat: first.lat,
        lng: first.lng,
        eventId: null,
        lastLat: first.lat,
        lastLng: first.lng,
        points: [],
      };
      this.logger.log(`Yangi state: carId=${carId}, status=moving`);
    }

    let stateChanged = false;

    for (const record of records) {
      const prevStatus = state.status;
      state = await this.transition(carId, state, record);
      if (state.status !== prevStatus) {
        stateChanged = true;
        this.logger.log(
          `State o'zgardi: carId=${carId}, ${prevStatus} → ${state.status}`,
        );
      }
    }

    await this.setState(carId, state);

    if (stateChanged) {
      await this.emitMotionState(carId, state);
    }
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cron } from '@nestjs/schedule';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { cars, carStopEvents } from '@/shared/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { GpsRecord } from './codec8.parser';
import { MOTION, MotionState } from './motion-state.constants';
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

  // ─── Redis ───

  private async getState(carId: number): Promise<MotionState | null> {
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
      return data as MotionState;
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

  private async createEvent(
    carId: number,
    type: 'stop' | 'parking',
    startAt: Date,
    lat: number,
    lng: number,
  ): Promise<number> {
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

  // ─── State Machine ───

  private isMoving(state: MotionState, record: GpsRecord): boolean {
    const speed = record.speed ?? 0;

    if (speed > MOTION.SPEED_THRESHOLD) return true;

    const distance = this.calculateDistance(
      state.lat,
      state.lng,
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

    if (status === 'parking') {
      return state;
    }

    if (status === 'parking_candidate') {
      if (elapsedSeconds >= MOTION.PARKING_THRESHOLD) {
        const eventId = await this.createEvent(
          carId,
          'parking',
          new Date(state.since),
          state.lat,
          state.lng,
        );
        return {
          status: 'parking',
          since: state.since,
          lat: state.lat,
          lng: state.lng,
          eventId,
        };
      }
      return state;
    }

    if (status === 'stopped' && state.eventId) {
      await this.closeEvent(state.eventId, recordTime, new Date(state.since));
    }

    return {
      status: 'parking_candidate',
      since: recordTime.toISOString(),
      lat: record.lat,
      lng: record.lng,
      eventId: null,
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

    if (status === 'stopped') {
      return state;
    }

    if (status === 'stop_candidate') {
      if (elapsedSeconds >= MOTION.STOP_THRESHOLD) {
        const eventId = await this.createEvent(
          carId,
          'stop',
          new Date(state.since),
          state.lat,
          state.lng,
        );
        return {
          status: 'stopped',
          since: state.since,
          lat: state.lat,
          lng: state.lng,
          eventId,
        };
      }
      return state;
    }

    if (status === 'parking' && state.eventId) {
      await this.closeEvent(state.eventId, recordTime, new Date(state.since));
    }

    return {
      status: 'stop_candidate',
      since: recordTime.toISOString(),
      lat: record.lat,
      lng: record.lng,
      eventId: null,
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
      return state;
    }

    if ((status === 'stopped' || status === 'parking') && state.eventId) {
      await this.closeEvent(state.eventId, recordTime, new Date(state.since));
    }

    return {
      status: 'moving',
      since: recordTime.toISOString(),
      lat: record.lat,
      lng: record.lng,
      eventId: null,
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
          const eventId = await this.createEvent(
            carId,
            'parking',
            new Date(state.since),
            state.lat,
            state.lng,
          );
          newState = {
            status: 'parking',
            since: state.since,
            lat: state.lat,
            lng: state.lng,
            eventId,
          };
        }

        if (
          state.status === 'stop_candidate' &&
          elapsedSeconds >= MOTION.STOP_THRESHOLD
        ) {
          const eventId = await this.createEvent(
            carId,
            'stop',
            new Date(state.since),
            state.lat,
            state.lng,
          );
          newState = {
            status: 'stopped',
            since: state.since,
            lat: state.lat,
            lng: state.lng,
            eventId,
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
    // Active car listga qo'shish
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

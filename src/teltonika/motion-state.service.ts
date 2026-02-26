import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carStopEvents } from '@/shared/database/schema';
import { eq } from 'drizzle-orm';
import { GpsRecord } from './codec8.parser';
import { MOTION, MotionState } from './motion-state.constants';

@Injectable()
export class MotionStateService {
  private readonly logger = new Logger('MotionState');

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    @InjectDb() private db: DataSource,
  ) {}

  // ─── Redis helpers ───

  private redisKey(carId: number): string {
    return `${MOTION.REDIS_PREFIX}:${carId}`;
  }

  private async getState(carId: number): Promise<MotionState | null> {
    this.logger.log(`getState: ${this.redisKey(carId)}`);
    const raw: unknown = await this.cache.get(this.redisKey(carId));
    if (!raw || typeof raw !== 'object') return null;

    if ('status' in raw && 'since' in raw) {
      return raw as MotionState;
    }

    return null;
  }

  private async setState(carId: number, state: MotionState): Promise<void> {
    // TTL 0 = cheksiz
    await this.cache.set(this.redisKey(carId), JSON.stringify(state), 0);
  }

  // ─── DB helpers ───

  private async createEvent(
    carId: number,
    type: 'stop' | 'parking',
    startAt: Date,
    lat: number,
    lng: number,
  ): Promise<number> {
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

  /**
   * Yangi GPS record asosida qaysi holatga o'tish kerakligini aniqlaydi.
   * DB ga yozish/yangilash shu yerda bo'ladi.
   */
  private async transition(
    carId: number,
    state: MotionState,
    record: GpsRecord,
  ): Promise<MotionState> {
    const speed = record.speed ?? 0;
    const ignition = record.io.ignition;
    const recordTime = new Date(record.timestamp);
    const sinceTime = new Date(state.since);
    const elapsedSeconds = (recordTime.getTime() - sinceTime.getTime()) / 1000;

    // ─── IGNITION OFF → parking candidate yoki parking ───
    if (ignition === false) {
      return this.handleIgnitionOff(
        carId,
        state,
        record,
        recordTime,
        elapsedSeconds,
      );
    }

    // ─── IGNITION ON ───
    const isSlow = speed <= MOTION.SPEED_THRESHOLD;

    if (isSlow) {
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

    // Agar allaqachon parking yoki parking_candidate bo'lsa
    if (status === 'parking') {
      return state; // o'zgarish yo'q
    }

    if (status === 'parking_candidate') {
      if (elapsedSeconds >= MOTION.PARKING_THRESHOLD) {
        // ✅ Haqiqiy parking — DB ga yoz
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
      return state; // hali kutmoqda
    }

    // Boshqa holatdan (moving, stop_candidate, stopped) → parking_candidate
    // Agar ochiq stop event bo'lsa, yopamiz
    if (status === 'stopped' && state.eventId) {
      await this.closeEvent(state.eventId, recordTime, new Date(state.since));
    }

    // Agar stop_candidate bo'lsa — bekor, DB ga hech narsa yozilmagan

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
      return state; // hali to'xtab turibdi
    }

    if (status === 'stop_candidate') {
      if (elapsedSeconds >= MOTION.STOP_THRESHOLD) {
        // ✅ Haqiqiy stop — DB ga yoz
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
      return state; // hali kutmoqda
    }

    // moving, parking, parking_candidate → stop_candidate
    // Agar parking bo'lsa va eventId bo'lsa — yopamiz (ignition yondi + sekin)
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
      return state; // allaqachon harakatda
    }

    // Ochiq eventni yopish kerak
    if ((status === 'stopped' || status === 'parking') && state.eventId) {
      await this.closeEvent(state.eventId, recordTime, new Date(state.since));
    }

    // stop_candidate, parking_candidate → moving (DB ga hech narsa yozilmagan, bekor)

    return {
      status: 'moving',
      since: recordTime.toISOString(),
      lat: record.lat,
      lng: record.lng,
      eventId: null,
    };
  }

  // ─── Public API ───

  async processRecords(carId: number, records: GpsRecord[]): Promise<void> {
    this.logger.log(
      `processRecords boshlandi: carId=${carId}, records=${records.length}`,
    );
    let state = await this.getState(carId);

    // Birinchi marta — default holat
    if (!state) {
      const first = records[0];
      state = {
        status: 'moving',
        since: new Date(first.timestamp).toISOString(),
        lat: first.lat,
        lng: first.lng,
        eventId: null,
      };
    }

    // Har record uchun state machine ishlatish
    for (const record of records) {
      state = await this.transition(carId, state, record);
    }

    // Redis ga saqlash
    await this.setState(carId, state);
  }
}

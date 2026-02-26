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
    const raw: unknown = await this.cache.get(this.redisKey(carId));
    if (!raw) return null;

    let data: unknown = raw;

    // String bo'lsa parse qil
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }

    // Keyv wrapper: {value: "..."}
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

    // stopped → parking_candidate (stop eventni yopamiz)
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

  // ─── Public API ───

  async processRecords(carId: number, records: GpsRecord[]): Promise<void> {
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

    for (const record of records) {
      const prevStatus = state.status;
      state = await this.transition(carId, state, record);
      if (state.status !== prevStatus) {
        this.logger.log(
          `State o'zgardi: carId=${carId}, ${prevStatus} → ${state.status}`,
        );
      }
    }

    await this.setState(carId, state);
  }
}

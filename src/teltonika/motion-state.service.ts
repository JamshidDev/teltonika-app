import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Cron } from '@nestjs/schedule';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { cars, carStopEvents } from '@/shared/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { GpsRecord } from './codec8.parser';
import { MotionState, MotionStatus } from './motion-state.constants';
import { MotionConfig } from '@/shared/config/motion.config';
import { TrackingGateway } from '@/shared/gateway/tracking.gateway';

const ACTIVE_CARS_KEY = 'motion:active';

@Injectable()
export class MotionStateService {
  private readonly logger = new Logger('MotionState');

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    @InjectDb() private db: DataSource,
    private readonly config: MotionConfig,
    private readonly trackingGateway: TrackingGateway,
  ) {}

  // ─── Helpers ───

  private redisKey(carId: number): string {
    return `${this.config.redisPrefix}:${carId}`;
  }

  /** Haversine — 2 nuqta orasidagi masofa (metr) */
  private calcDistance(
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

  /** GPS nuqta ishonchli yoki yo'qligini tekshirish */
  private isReliablePoint(record: GpsRecord, state: MotionState | null): boolean {
    if ((record.speed ?? 0) > this.config.maxSpeed) return false;
    if (record.satellites < this.config.minSatellites) return false;
    if (record.io.hdop !== null && record.io.hdop > this.config.maxHdop) return false;

    // Masofa sakrash (faqat state mavjud bo'lsa)
    if (state && state.lastLat !== 0 && state.lastLng !== 0) {
      const dist = this.calcDistance(
        state.lastLat,
        state.lastLng,
        record.lat,
        record.lng,
      );
      if (dist > this.config.gpsJumpThreshold) return false;
    }

    return true;
  }

  /**
   * Speed va distance ziddiyatini tekshirish.
   * true = valid (mos), false = ziddiyat (glitch)
   */
  private isConsistent(distance: number, speed: number, ignition: boolean | null): boolean {
    // dist > radius lekin speed = 0 → GPS jitter
    if (distance > this.config.radius && speed < 1) return false;
    // dist < radius lekin speed > 30 → sensor glitch
    if (distance < this.config.radius && speed > 30) return false;
    return true;
  }

  /** Birinchi data bo'yicha boshlang'ich state yaratish */
  private initializeState(record: GpsRecord): MotionState {
    const speed = record.speed ?? 0;
    const ignition = record.io.ignition;
    const time = new Date(record.timestamp).toISOString();

    let state: MotionStatus;
    if (speed > this.config.speedThreshold && ignition !== false) {
      state = 'MOVING';
    } else if (ignition === false) {
      state = 'PARKING';
    } else {
      state = 'STOPPED';
    }

    return {
      state,
      anchorLat: record.lat,
      anchorLng: record.lng,
      anchorTime: time,
      consecutiveCount: 0,
      timerStartedAt: null,
      movingTimerStartedAt: null,
      currentEventId: null,
      lastLat: record.lat,
      lastLng: record.lng,
      lastSpeed: speed,
      lastTime: time,
    };
  }

  // ─── Redis ───

  async getState(carId: number): Promise<MotionState | null> {
    const raw: unknown = await this.cache.get(this.redisKey(carId));
    if (!raw) return null;

    let data: unknown = raw;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return null; }
    }
    if (typeof data === 'object' && data !== null && 'value' in data) {
      const inner = (data as { value: unknown }).value;
      if (typeof inner === 'string') {
        try { data = JSON.parse(inner); } catch { return null; }
      } else {
        data = inner;
      }
    }

    if (typeof data === 'object' && data !== null && 'state' in data) {
      return data as MotionState;
    }
    return null;
  }

  private async setState(carId: number, state: MotionState): Promise<void> {
    await this.cache.set(this.redisKey(carId), state, this.config.redisTtl * 1000);
  }

  // ─── Active cars ───

  private async getActiveCars(): Promise<number[]> {
    const raw: unknown = await this.cache.get(ACTIVE_CARS_KEY);
    if (!raw) return [];
    let data: unknown = raw;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return []; }
    }
    if (typeof data === 'object' && data !== null && 'value' in data) {
      const inner = (data as { value: unknown }).value;
      if (typeof inner === 'string') {
        try { data = JSON.parse(inner); } catch { return []; }
      } else { data = inner; }
    }
    return Array.isArray(data) ? (data as number[]) : [];
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
      `${type.toUpperCase()} event yaratildi: carId=${carId}, eventId=${result.id}, lat=${lat}, lng=${lng}`,
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

    this.logger.log(`Event yopildi: eventId=${eventId}, duration=${durationSeconds}s`);
  }

  // ─── State Machine ───

  private async transition(
    carId: number,
    state: MotionState,
    record: GpsRecord,
  ): Promise<MotionState> {
    // GPS ishonchlilik
    if (!this.isReliablePoint(record, state)) {
      this.logger.debug(
        `[SKIP] carId=${carId}: GPS ishonchsiz, speed=${record.speed}, sat=${record.satellites}, hdop=${record.io.hdop}`,
      );
      return state;
    }

    const speed = record.speed ?? 0;
    const ignition = record.io.ignition;
    const time = new Date(record.timestamp);
    const distFromAnchor = this.calcDistance(
      state.anchorLat,
      state.anchorLng,
      record.lat,
      record.lng,
    );

    this.logger.debug(
      `[TRANSITION] carId=${carId}: state=${state.state}, speed=${speed}, ign=${ignition}, ` +
        `distAnchor=${distFromAnchor.toFixed(1)}m, count=${state.consecutiveCount}, ` +
        `lat=${record.lat}, lng=${record.lng}`,
    );

    // Ziddiyat tekshirish
    if (!this.isConsistent(distFromAnchor, speed, ignition)) {
      this.logger.debug(
        `[GLITCH] carId=${carId}: ziddiyat! dist=${distFromAnchor.toFixed(1)}m, speed=${speed} → count RESET`,
      );
      state.consecutiveCount = 0;
      if (state.movingTimerStartedAt) state.movingTimerStartedAt = null;
      return { ...state, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: time.toISOString() };
    }

    switch (state.state) {
      case 'MOVING':
        return this.handleMoving(carId, state, record, speed, ignition, distFromAnchor, time);
      case 'STOP_PENDING':
        return this.handleStopPending(carId, state, record, speed, ignition, distFromAnchor, time);
      case 'STOPPED':
        return this.handleStopped(carId, state, record, speed, ignition, distFromAnchor, time);
      case 'PARKING_PENDING':
        return this.handleParkingPending(carId, state, record, speed, ignition, distFromAnchor, time);
      case 'PARKING':
        return this.handleParking(carId, state, record, speed, ignition, distFromAnchor, time);
      default:
        return state;
    }
  }

  // ─── MOVING ───

  private async handleMoving(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    speed: number,
    ignition: boolean | null,
    distFromAnchor: number,
    time: Date,
  ): Promise<MotionState> {
    const timeStr = time.toISOString();

    // Stop candidate: dist < radius + speed < threshold + ignition ON (yoki null)
    if (distFromAnchor < this.config.radius && speed < this.config.speedThreshold && ignition !== false) {
      const newCount = state.consecutiveCount + 1;

      if (newCount === 1) {
        // Birinchi mos data — anchor saqla
        return {
          ...state,
          anchorLat: record.lat,
          anchorLng: record.lng,
          anchorTime: timeStr,
          consecutiveCount: newCount,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }

      if (newCount >= this.config.consecutiveCount) {
        // 5 ta to'ldi → STOP_PENDING
        this.logger.log(`carId=${carId}: MOVING → STOP_PENDING`);
        return {
          state: 'STOP_PENDING',
          anchorLat: state.anchorLat,
          anchorLng: state.anchorLng,
          anchorTime: state.anchorTime,
          consecutiveCount: 0,
          timerStartedAt: state.anchorTime,
          movingTimerStartedAt: null,
          currentEventId: null,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }

      return { ...state, consecutiveCount: newCount, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Parking candidate: dist < radius + speed < threshold + ignition OFF
    if (distFromAnchor < this.config.radius && speed < this.config.speedThreshold && ignition === false) {
      const newCount = state.consecutiveCount + 1;

      if (newCount === 1) {
        return {
          ...state,
          anchorLat: record.lat,
          anchorLng: record.lng,
          anchorTime: timeStr,
          consecutiveCount: newCount,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }

      if (newCount >= this.config.consecutiveCount) {
        this.logger.log(`carId=${carId}: MOVING → PARKING_PENDING`);
        return {
          state: 'PARKING_PENDING',
          anchorLat: state.anchorLat,
          anchorLng: state.anchorLng,
          anchorTime: state.anchorTime,
          consecutiveCount: 0,
          timerStartedAt: state.anchorTime,
          movingTimerStartedAt: null,
          currentEventId: null,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }

      return { ...state, consecutiveCount: newCount, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Harakat davom etmoqda — count reset, anchor yangilash
    return {
      ...state,
      consecutiveCount: 0,
      anchorLat: record.lat,
      anchorLng: record.lng,
      anchorTime: timeStr,
      lastLat: record.lat,
      lastLng: record.lng,
      lastSpeed: speed,
      lastTime: timeStr,
    };
  }

  // ─── STOP_PENDING (10 min timer) ───

  private async handleStopPending(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    speed: number,
    ignition: boolean | null,
    distFromAnchor: number,
    time: Date,
  ): Promise<MotionState> {
    const timeStr = time.toISOString();
    const timerElapsed = state.timerStartedAt
      ? (time.getTime() - new Date(state.timerStartedAt).getTime()) / 1000
      : 0;

    // Hali turgan joyida: dist < radius + speed < threshold + ignition ON
    if (distFromAnchor < this.config.radius && speed < this.config.speedThreshold && ignition !== false) {
      // Timer to'ldimi?
      if (timerElapsed >= this.config.stopTimeout) {
        const eventId = await this.createEvent(
          carId,
          'stop',
          new Date(state.anchorTime),
          state.anchorLat,
          state.anchorLng,
        );
        this.logger.log(`carId=${carId}: STOP_PENDING → STOPPED (${this.config.stopTimeout}s)`);
        return {
          state: 'STOPPED',
          anchorLat: state.anchorLat,
          anchorLng: state.anchorLng,
          anchorTime: state.anchorTime,
          consecutiveCount: 0,
          timerStartedAt: state.timerStartedAt,
          movingTimerStartedAt: null,
          currentEventId: eventId,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }
      // Timer davom — count reset (stop holat uchun count kerak emas)
      return { ...state, consecutiveCount: 0, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Ignition OFF bo'ldi — PARKING_PENDING ga o'tish
    if (speed < this.config.speedThreshold && ignition === false) {
      const newCount = state.consecutiveCount + 1;
      if (newCount >= this.config.consecutiveCount) {
        this.logger.log(`carId=${carId}: STOP_PENDING → PARKING_PENDING (ignition OFF)`);
        return {
          state: 'PARKING_PENDING',
          anchorLat: state.anchorLat,
          anchorLng: state.anchorLng,
          anchorTime: state.anchorTime,
          consecutiveCount: 0,
          timerStartedAt: timeStr,
          movingTimerStartedAt: null,
          currentEventId: null,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }
      return { ...state, consecutiveCount: newCount, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Harakatlandi — chiqish uchun 5 ta ketma-ket
    if (distFromAnchor >= this.config.radius && speed >= this.config.speedThreshold) {
      const newCount = state.consecutiveCount + 1;
      if (newCount >= this.config.consecutiveCount) {
        this.logger.log(`carId=${carId}: STOP_PENDING → MOVING (harakatlandi)`);
        return {
          state: 'MOVING',
          anchorLat: record.lat,
          anchorLng: record.lng,
          anchorTime: timeStr,
          consecutiveCount: 0,
          timerStartedAt: null,
          movingTimerStartedAt: null,
          currentEventId: null,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }
      return { ...state, consecutiveCount: newCount, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Boshqa holat — count reset
    return { ...state, consecutiveCount: 0, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
  }

  // ─── STOPPED ───

  private async handleStopped(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    speed: number,
    ignition: boolean | null,
    distFromAnchor: number,
    time: Date,
  ): Promise<MotionState> {
    const timeStr = time.toISOString();

    // Hali turgan joyida, ignition ON — STOPPED da qoladi
    if (distFromAnchor < this.config.radius && speed < this.config.speedThreshold && ignition !== false) {
      return {
        ...state,
        consecutiveCount: 0,
        movingTimerStartedAt: null,
        lastLat: record.lat,
        lastLng: record.lng,
        lastSpeed: speed,
        lastTime: timeStr,
      };
    }

    // Ignition OFF — PARKING_PENDING ga o'tish
    if (speed < this.config.speedThreshold && ignition === false) {
      const newCount = state.consecutiveCount + 1;
      if (newCount >= this.config.consecutiveCount) {
        // Stop event yopish
        if (state.currentEventId) {
          await this.closeEvent(state.currentEventId, time, new Date(state.anchorTime));
        }
        this.logger.log(`carId=${carId}: STOPPED → PARKING_PENDING (ignition OFF)`);
        return {
          state: 'PARKING_PENDING',
          anchorLat: record.lat,
          anchorLng: record.lng,
          anchorTime: timeStr,
          consecutiveCount: 0,
          timerStartedAt: timeStr,
          movingTimerStartedAt: null,
          currentEventId: null,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }
      return { ...state, consecutiveCount: newCount, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Harakatlandi — MOVING ga o'tish (5 ta + 2 min)
    if (distFromAnchor >= this.config.radius && speed >= this.config.speedThreshold) {
      const newCount = state.consecutiveCount + 1;

      // Moving timer boshlash (birinchi moving data da)
      let movingTimerStart = state.movingTimerStartedAt;
      if (!movingTimerStart) {
        movingTimerStart = timeStr;
      }

      if (newCount >= this.config.consecutiveCount) {
        const movingElapsed = (time.getTime() - new Date(movingTimerStart).getTime()) / 1000;
        if (movingElapsed >= this.config.movingTimeout) {
          // Stop event yopish
          if (state.currentEventId) {
            await this.closeEvent(state.currentEventId, new Date(movingTimerStart), new Date(state.anchorTime));
          }
          this.logger.log(`carId=${carId}: STOPPED → MOVING (${movingElapsed}s)`);
          return {
            state: 'MOVING',
            anchorLat: record.lat,
            anchorLng: record.lng,
            anchorTime: timeStr,
            consecutiveCount: 0,
            timerStartedAt: null,
            movingTimerStartedAt: null,
            currentEventId: null,
            lastLat: record.lat,
            lastLng: record.lng,
            lastSpeed: speed,
            lastTime: timeStr,
          };
        }
      }

      return {
        ...state,
        consecutiveCount: newCount,
        movingTimerStartedAt: movingTimerStart,
        lastLat: record.lat,
        lastLng: record.lng,
        lastSpeed: speed,
        lastTime: timeStr,
      };
    }

    // Boshqa holat — count reset, moving timer reset
    return {
      ...state,
      consecutiveCount: 0,
      movingTimerStartedAt: null,
      lastLat: record.lat,
      lastLng: record.lng,
      lastSpeed: speed,
      lastTime: timeStr,
    };
  }

  // ─── PARKING_PENDING (5 min timer) ───

  private async handleParkingPending(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    speed: number,
    ignition: boolean | null,
    distFromAnchor: number,
    time: Date,
  ): Promise<MotionState> {
    const timeStr = time.toISOString();
    const timerElapsed = state.timerStartedAt
      ? (time.getTime() - new Date(state.timerStartedAt).getTime()) / 1000
      : 0;

    // Hali turgan joyida, ignition OFF — timer davom
    if (distFromAnchor < this.config.radius && speed < this.config.speedThreshold && ignition === false) {
      if (timerElapsed >= this.config.parkingTimeout) {
        const eventId = await this.createEvent(
          carId,
          'parking',
          new Date(state.anchorTime),
          state.anchorLat,
          state.anchorLng,
        );
        this.logger.log(`carId=${carId}: PARKING_PENDING → PARKING (${this.config.parkingTimeout}s)`);
        return {
          state: 'PARKING',
          anchorLat: state.anchorLat,
          anchorLng: state.anchorLng,
          anchorTime: state.anchorTime,
          consecutiveCount: 0,
          timerStartedAt: state.timerStartedAt,
          movingTimerStartedAt: null,
          currentEventId: eventId,
          lastLat: record.lat,
          lastLng: record.lng,
          lastSpeed: speed,
          lastTime: timeStr,
        };
      }
      return { ...state, consecutiveCount: 0, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Harakatlandi — MOVING ga (5 ta + 2 min)
    if (distFromAnchor >= this.config.radius && speed >= this.config.speedThreshold) {
      const newCount = state.consecutiveCount + 1;

      let movingTimerStart = state.movingTimerStartedAt;
      if (!movingTimerStart) {
        movingTimerStart = timeStr;
      }

      if (newCount >= this.config.consecutiveCount) {
        const movingElapsed = (time.getTime() - new Date(movingTimerStart).getTime()) / 1000;
        if (movingElapsed >= this.config.movingTimeout) {
          this.logger.log(`carId=${carId}: PARKING_PENDING → MOVING`);
          return {
            state: 'MOVING',
            anchorLat: record.lat,
            anchorLng: record.lng,
            anchorTime: timeStr,
            consecutiveCount: 0,
            timerStartedAt: null,
            movingTimerStartedAt: null,
            currentEventId: null,
            lastLat: record.lat,
            lastLng: record.lng,
            lastSpeed: speed,
            lastTime: timeStr,
          };
        }
      }

      return {
        ...state,
        consecutiveCount: newCount,
        movingTimerStartedAt: movingTimerStart,
        lastLat: record.lat,
        lastLng: record.lng,
        lastSpeed: speed,
        lastTime: timeStr,
      };
    }

    // Ignition ON + turgan joyida — count reset, parking timer davom
    if (distFromAnchor < this.config.radius && speed < this.config.speedThreshold && ignition !== false) {
      return { ...state, consecutiveCount: 0, movingTimerStartedAt: null, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
    }

    // Boshqa — count reset
    return { ...state, consecutiveCount: 0, movingTimerStartedAt: null, lastLat: record.lat, lastLng: record.lng, lastSpeed: speed, lastTime: timeStr };
  }

  // ─── PARKING ───

  private async handleParking(
    carId: number,
    state: MotionState,
    record: GpsRecord,
    speed: number,
    ignition: boolean | null,
    distFromAnchor: number,
    time: Date,
  ): Promise<MotionState> {
    const timeStr = time.toISOString();

    // Hali turgan joyida — PARKING da qoladi (ignition ON ham bo'lsa)
    if (distFromAnchor < this.config.radius && speed < this.config.speedThreshold) {
      return {
        ...state,
        consecutiveCount: 0,
        movingTimerStartedAt: null,
        lastLat: record.lat,
        lastLng: record.lng,
        lastSpeed: speed,
        lastTime: timeStr,
      };
    }

    // Harakatlandi — MOVING ga (5 ta + 2 min)
    if (distFromAnchor >= this.config.radius && speed >= this.config.speedThreshold && ignition !== false) {
      const newCount = state.consecutiveCount + 1;

      let movingTimerStart = state.movingTimerStartedAt;
      if (!movingTimerStart) {
        movingTimerStart = timeStr;
      }

      if (newCount >= this.config.consecutiveCount) {
        const movingElapsed = (time.getTime() - new Date(movingTimerStart).getTime()) / 1000;
        if (movingElapsed >= this.config.movingTimeout) {
          // Parking event yopish — endAt = moving timer boshlangan vaqt
          if (state.currentEventId) {
            await this.closeEvent(state.currentEventId, new Date(movingTimerStart), new Date(state.anchorTime));
          }
          this.logger.log(`carId=${carId}: PARKING → MOVING (${movingElapsed}s)`);
          return {
            state: 'MOVING',
            anchorLat: record.lat,
            anchorLng: record.lng,
            anchorTime: timeStr,
            consecutiveCount: 0,
            timerStartedAt: null,
            movingTimerStartedAt: null,
            currentEventId: null,
            lastLat: record.lat,
            lastLng: record.lng,
            lastSpeed: speed,
            lastTime: timeStr,
          };
        }
      }

      return {
        ...state,
        consecutiveCount: newCount,
        movingTimerStartedAt: movingTimerStart,
        lastLat: record.lat,
        lastLng: record.lng,
        lastSpeed: speed,
        lastTime: timeStr,
      };
    }

    // Towing: ignition OFF + speed > 5 + dist > radius
    if (ignition === false && speed > this.config.speedThreshold && distFromAnchor >= this.config.radius) {
      const newCount = state.consecutiveCount + 1;

      let movingTimerStart = state.movingTimerStartedAt;
      if (!movingTimerStart) {
        movingTimerStart = timeStr;
      }

      if (newCount >= this.config.consecutiveCount) {
        const movingElapsed = (time.getTime() - new Date(movingTimerStart).getTime()) / 1000;
        if (movingElapsed >= this.config.movingTimeout) {
          if (state.currentEventId) {
            await this.closeEvent(state.currentEventId, new Date(movingTimerStart), new Date(state.anchorTime));
          }
          this.logger.log(`carId=${carId}: PARKING → MOVING (towing detected)`);
          return {
            state: 'MOVING',
            anchorLat: record.lat,
            anchorLng: record.lng,
            anchorTime: timeStr,
            consecutiveCount: 0,
            timerStartedAt: null,
            movingTimerStartedAt: null,
            currentEventId: null,
            lastLat: record.lat,
            lastLng: record.lng,
            lastSpeed: speed,
            lastTime: timeStr,
          };
        }
      }

      return {
        ...state,
        consecutiveCount: newCount,
        movingTimerStartedAt: movingTimerStart,
        lastLat: record.lat,
        lastLng: record.lng,
        lastSpeed: speed,
        lastTime: timeStr,
      };
    }

    // Boshqa — count reset
    return {
      ...state,
      consecutiveCount: 0,
      movingTimerStartedAt: null,
      lastLat: record.lat,
      lastLng: record.lng,
      lastSpeed: speed,
      lastTime: timeStr,
    };
  }

  // ─── Socket emit ───

  /** Status ni eski formatga convert qilish (frontend uchun) */
  toFrontendStatus(status: MotionStatus): string {
    const map: Record<MotionStatus, string> = {
      MOVING: 'moving',
      STOP_PENDING: 'stop_candidate',
      STOPPED: 'stopped',
      PARKING_PENDING: 'parking_candidate',
      PARKING: 'parking',
    };
    return map[status] ?? 'moving';
  }

  private async emitMotionState(carId: number, state: MotionState) {
    const car = await this.getCarInfo(carId);
    if (!car) return;

    this.trackingGateway.emitCarMotion({
      carId,
      carName: car.name,
      carNumber: car.carNumber,
      status: this.toFrontendStatus(state.state),
      since: state.anchorTime,
      lat: state.anchorLat,
      lng: state.anchorLng,
    });
  }

  // ─── Cron: PENDING timerlarni tekshirish ───

  @Cron('*/60 * * * * *')
  async checkPendingTimeouts(): Promise<void> {
    const activeCars = await this.getActiveCars();
    if (activeCars.length === 0) return;

    const now = Date.now();

    for (const carId of activeCars) {
      try {
        const state = await this.getState(carId);
        if (!state) continue;

        let newState: MotionState | null = null;

        // STOP_PENDING — 10 min timer
        if (state.state === 'STOP_PENDING' && state.timerStartedAt) {
          const elapsed = (now - new Date(state.timerStartedAt).getTime()) / 1000;
          if (elapsed >= this.config.stopTimeout) {
            const eventId = await this.createEvent(
              carId,
              'stop',
              new Date(state.anchorTime),
              state.anchorLat,
              state.anchorLng,
            );
            newState = {
              ...state,
              state: 'STOPPED',
              consecutiveCount: 0,
              currentEventId: eventId,
            };
            this.logger.log(`Cron: carId=${carId} STOP_PENDING → STOPPED`);
          }
        }

        // PARKING_PENDING — 5 min timer
        if (state.state === 'PARKING_PENDING' && state.timerStartedAt) {
          const elapsed = (now - new Date(state.timerStartedAt).getTime()) / 1000;
          if (elapsed >= this.config.parkingTimeout) {
            const eventId = await this.createEvent(
              carId,
              'parking',
              new Date(state.anchorTime),
              state.anchorLat,
              state.anchorLng,
            );
            newState = {
              ...state,
              state: 'PARKING',
              consecutiveCount: 0,
              currentEventId: eventId,
            };
            this.logger.log(`Cron: carId=${carId} PARKING_PENDING → PARKING`);
          }
        }

        if (newState) {
          await this.setState(carId, newState);
          await this.emitMotionState(carId, newState);
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

    this.logger.debug(
      `[PROCESS] carId=${carId}: ${records.length} ta record, ` +
        `state=${state ? state.state : 'NULL (yangi device)'}`,
    );

    if (!state) {
      const first = records[0];

      // GPS ishonchlilik tekshirish
      if (!this.isReliablePoint(first, null)) {
        this.logger.warn(
          `[PROCESS] carId=${carId}: birinchi data ishonchsiz, speed=${first.speed}, sat=${first.satellites} — SKIP`,
        );
        return;
      }

      state = this.initializeState(first);

      // Birinchi datada STOPPED/PARKING bo'lsa — darhol event yaratish
      if (state.state === 'STOPPED') {
        const eventId = await this.createEvent(
          carId,
          'stop',
          new Date(first.timestamp),
          first.lat,
          first.lng,
        );
        state.currentEventId = eventId;
      } else if (state.state === 'PARKING') {
        const eventId = await this.createEvent(
          carId,
          'parking',
          new Date(first.timestamp),
          first.lat,
          first.lng,
        );
        state.currentEventId = eventId;
      }

      this.logger.log(
        `[INIT] carId=${carId}: yangi device, state=${state.state}, ` +
          `speed=${first.speed}, ign=${first.io.ignition}, lat=${first.lat}, lng=${first.lng}`,
      );
      records = records.slice(1);
    }

    let prevState = state.state;

    for (const record of records) {
      state = await this.transition(carId, state, record);

      if (state.state !== prevState) {
        this.logger.log(
          `[STATE] carId=${carId}: ${prevState} → ${state.state}, ` +
            `count=${state.consecutiveCount}, anchor=(${state.anchorLat.toFixed(6)},${state.anchorLng.toFixed(6)})`,
        );
        await this.emitMotionState(carId, state);
        prevState = state.state;
      }
    }

    this.logger.debug(
      `[PROCESS] carId=${carId}: tugadi, state=${state.state}, count=${state.consecutiveCount}`,
    );

    await this.setState(carId, state);
  }
}

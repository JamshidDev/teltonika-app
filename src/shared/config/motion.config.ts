import { Injectable } from '@nestjs/common';

@Injectable()
export class MotionConfig {
  // ─── State machine thresholds ───

  /** Radius (metr) — shu ichida tursa "qimirlamagan" hisoblanadi */
  radius: number = Number(process.env.MOTION_RADIUS) || 50;

  /** Speed (km/h) — bundan past = to'xtagan */
  speedThreshold: number = Number(process.env.MOTION_SPEED_THRESHOLD) || 5;

  /** Ketma-ket data soni — o'tish uchun kerak */
  consecutiveCount: number = Number(process.env.MOTION_CONSECUTIVE_COUNT) || 5;

  /** Stop timer (sekund) — STOP_PENDING → STOPPED */
  stopTimeout: number = Number(process.env.MOTION_STOP_TIMEOUT) || 600;

  /** Parking timer (sekund) — PARKING_PENDING → PARKING */
  parkingTimeout: number = Number(process.env.MOTION_PARKING_TIMEOUT) || 300;

  /** Moving timer (sekund) — STOPPED/PARKING → MOVING */
  movingTimeout: number = Number(process.env.MOTION_MOVING_TIMEOUT) || 120;

  // ─── GPS filters ───

  /** Max tezlik (km/h) — bundan katta = noto'g'ri GPS */
  maxSpeed: number = Number(process.env.MOTION_MAX_SPEED) || 200;

  /** Min satellite soni — kamroq bo'lsa GPS signal yomon */
  minSatellites: number = Number(process.env.MOTION_MIN_SATELLITES) || 4;

  /** Max HDOP — yuqori bo'lsa GPS aniqlik past */
  maxHdop: number = Number(process.env.MOTION_MAX_HDOP) || 5;

  /** GPS sakrash chegarasi (metr) — bundan katta = ishonchsiz nuqta */
  gpsJumpThreshold: number = Number(process.env.MOTION_GPS_JUMP_THRESHOLD) || 300;

  // ─── Redis ───

  /** Redis key prefix */
  redisPrefix: string = process.env.MOTION_REDIS_PREFIX || 'motion';

  /** Redis TTL (sekund) — state qancha vaqt saqlanadi */
  redisTtl: number = Number(process.env.MOTION_REDIS_TTL) || 86400;
}

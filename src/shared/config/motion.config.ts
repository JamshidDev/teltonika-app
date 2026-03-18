import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class MotionConfig {
  // ─── State machine thresholds ───

  /** Radius (metr) — shu ichida tursa "qimirlamagan" hisoblanadi */
  @Value('MOTION_RADIUS')
  radius: number = 50;

  /** Speed (km/h) — bundan past = to'xtagan */
  @Value('MOTION_SPEED_THRESHOLD')
  speedThreshold: number = 5;

  /** Ketma-ket data soni — o'tish uchun kerak */
  @Value('MOTION_CONSECUTIVE_COUNT')
  consecutiveCount: number = 5;

  /** Stop timer (sekund) — STOP_PENDING → STOPPED */
  @Value('MOTION_STOP_TIMEOUT')
  stopTimeout: number = 600; // 10 daqiqa

  /** Parking timer (sekund) — PARKING_PENDING → PARKING */
  @Value('MOTION_PARKING_TIMEOUT')
  parkingTimeout: number = 300; // 5 daqiqa

  /** Moving timer (sekund) — STOPPED/PARKING → MOVING */
  @Value('MOTION_MOVING_TIMEOUT')
  movingTimeout: number = 120; // 2 daqiqa

  // ─── GPS filters ───

  /** Max tezlik (km/h) — bundan katta = noto'g'ri GPS */
  @Value('MOTION_MAX_SPEED')
  maxSpeed: number = 200;

  /** Min satellite soni — kamroq bo'lsa GPS signal yomon */
  @Value('MOTION_MIN_SATELLITES')
  minSatellites: number = 4;

  /** Max HDOP — yuqori bo'lsa GPS aniqlik past */
  @Value('MOTION_MAX_HDOP')
  maxHdop: number = 5;

  /** GPS sakrash chegarasi (metr) — bundan katta = ishonchsiz nuqta */
  @Value('MOTION_GPS_JUMP_THRESHOLD')
  gpsJumpThreshold: number = 300;

  // ─── Redis ───

  /** Redis key prefix */
  @Value('MOTION_REDIS_PREFIX')
  redisPrefix: string = 'motion';

  /** Redis TTL (sekund) — state qancha vaqt saqlanadi */
  @Value('MOTION_REDIS_TTL')
  redisTtl: number = 86400; // 24 soat
}

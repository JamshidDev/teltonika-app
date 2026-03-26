/**
 * GPS filtrlash va route qurish uchun konstantalar.
 * Position va History service'larda ishlatiladi.
 */
export const MOTION = {
  MIN_SATELLITES: 4,
  MIN_SATELLITES_SAVE: 2,
  MAX_HDOP: 5,
  MAX_SPEED: 200,
  NO_IGNITION_MIN_SPEED: 5,
  EVENT_MIN_DURATION: 30,
  EVENT_MAX_ROUTE_DIST: 500,
  MERGE_MAX_GAP: 600,
  MERGE_MAX_DISTANCE: 200,
  MERGE_SHORT_GAP: 120,
} as const;

/**
 * Eski MOTION constant — boshqa service'lar (position, history) ishlatadi.
 * Yangi motion-state.service.ts MotionConfig dan o'qiydi.
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

/** Motion state machine holatlari */
export type MotionStatus =
  | 'MOVING'
  | 'STOP_PENDING'
  | 'STOPPED'
  | 'PARKING_PENDING'
  | 'PARKING';

/** Redis da saqlanadigan device holati */
export interface MotionState {
  /** Joriy holat */
  state: MotionStatus;

  /** Anchor — timer boshlangan nuqta koordinatasi */
  anchorLat: number;
  anchorLng: number;
  /** Anchor vaqti (ISO string) */
  anchorTime: string;

  /** Ketma-ket mos data hisoblagich */
  consecutiveCount: number;

  /** Joriy holat timeri boshlangan vaqt (ISO string) */
  timerStartedAt: string | null;

  /** Moving timer — STOPPED/PARKING dan chiqish uchun (ISO string) */
  movingTimerStartedAt: string | null;

  /** DB dagi joriy event ID */
  currentEventId: number | null;

  /** Oxirgi GPS nuqta (distance hisoblash uchun) */
  lastLat: number;
  lastLng: number;
  lastSpeed: number;
  lastTime: string;
}

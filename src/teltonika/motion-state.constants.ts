export const MOTION = {
  SPEED_THRESHOLD: 3, // km/h — bundan past = to'xtagan
  STOP_THRESHOLD: 120, // sekund — stop candidate → stopped
  PARKING_THRESHOLD: 180, // sekund — parking candidate → parking
  REDIS_PREFIX: 'motion', // Redis key: motion:{carId}
} as const;

export type MotionStatus =
  | 'moving'
  | 'stop_candidate'
  | 'stopped'
  | 'parking_candidate'
  | 'parking';

export interface MotionState {
  status: MotionStatus;
  since: string; // ISO date — candidate/event boshlangan vaqt
  lat: number;
  lng: number;
  eventId: number | null; // DB ga yozilgan event ID (stopped/parking uchun)
}

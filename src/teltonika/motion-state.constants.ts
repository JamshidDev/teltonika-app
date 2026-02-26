export const MOTION = {
  SPEED_THRESHOLD: 10, // km/h — bundan past = to'xtagan
  DISTANCE_THRESHOLD: 50, // metr — bundan kam siljish = jitter
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
  since: string;
  lat: number;
  lng: number;
  eventId: number | null;
}

export const MOTION = {
  SPEED_THRESHOLD: 10, // km/h — bundan past = to'xtagan
  DISTANCE_THRESHOLD: 50, // metr — bundan kam siljish = jitter
  STOP_THRESHOLD: 120, // sekund — stop candidate → stopped
  PARKING_THRESHOLD: 180, // sekund — parking candidate → parking
  REDIS_PREFIX: 'motion', // Redis key: motion:{carId}

  // GPS accuracy
  GPS_JUMP_THRESHOLD: 300, // metr — bundan katta sakrash = ishonchsiz nuqta
  MAX_STOP_POINTS: 30, // centroid uchun max nuqtalar soni
  MAX_SPEED: 200, // km/h — bundan katta tezlik = noto'g'ri GPS
} as const;

export type MotionStatus =
  | 'moving'
  | 'stop_candidate'
  | 'stopped'
  | 'parking_candidate'
  | 'parking';

/** Stop/parking davomida yig'ilgan nuqta */
export interface StopPoint {
  lat: number;
  lng: number;
  recordedAt: string;
}

export interface MotionState {
  status: MotionStatus;
  since: string;
  lat: number;
  lng: number;
  eventId: number | null;

  // Yangi: GPS aniqlik uchun
  lastLat: number; // oxirgi ishonchli GPS koordinata
  lastLng: number;
  points: StopPoint[]; // stop/parking davomidagi nuqtalar (centroid uchun)
}

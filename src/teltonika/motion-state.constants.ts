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
  MIN_SATELLITES: 4, // route + state machine (yuqori sifat)
  MIN_SATELLITES_SAVE: 2, // DB ga saqlash uchun minimum (audit trail)
  MAX_HDOP: 5, // bundan katta = GPS aniqlik past (Horizontal Dilution of Precision)

  // Event validation
  EVENT_MIN_DURATION: 30, // sekund — bundan qisqa stop = shubhali
  EVENT_MAX_ROUTE_DIST: 500, // metr — routedan bundan uzoq = shubhali

  // Route: ignition off da harakatni aniqlash (towing)
  NO_IGNITION_MIN_SPEED: 5, // km/h — ignition off da bundan yuqori tezlik = haqiqiy harakat

  // Event merging — bir xil joydagi ketma-ket eventlarni birlashtirish
  MERGE_MAX_GAP: 600, // sekund (10 min) — bir lokatsiyada gap bundan kam bo'lsa merge
  MERGE_MAX_DISTANCE: 200, // metr — eventlar orasidagi masofa bundan kam = bir joy
  MERGE_SHORT_GAP: 120, // sekund (2 min) — qisqa gap = lokatsiyadan mustaqil merge

  // Grace period: parking/stopped dan moving ga o'tishda sabr
  MOVING_GRACE_SPEED: 25, // km/h — bundan past tezlik = hali aniq harakat emas
  MOVING_GRACE_DISTANCE: 150, // metr — bundan kam masofa = hali joyidan chiqmagan
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

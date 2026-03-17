// src/config/route.config.ts
import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class RouteConfig {
  @Value('ROUTE_MIN_SPEED')
  minSpeed: number = 1; // 1 km/h — faqat to'liq to'xtagan nuqtalarni chiqarish

  @Value('ROUTE_MIN_DISTANCE')
  minDistance: number = 5; // 10 → 5 (aniqroq route)

  @Value('ROUTE_SEGMENT_GAP_MINUTES')
  segmentGapMinutes: number = 30;

  @Value('ROUTE_MAX_DISTANCE')
  maxDistance: number = 500;

  @Value('ROUTE_SMOOTH_POINTS')
  smoothPoints: number = 3; // boshi/oxiri smooth uchun

  @Value('ROUTE_MAX_SNAP_DISTANCE')
  maxSnapDistance: number = 200; // metr — stop snap uchun max masofa

  @Value('ROUTE_JITTER_THRESHOLD')
  jitterThreshold: number = 15; // metr — bundan kam masofa = jitter smooth qilish
}

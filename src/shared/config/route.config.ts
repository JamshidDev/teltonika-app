// src/config/route.config.ts
import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class RouteConfig {
  @Value('ROUTE_MIN_SPEED')
  minSpeed: number = 2; // 10 → 2 (sekin harakatni ham ko'rsatish)

  @Value('ROUTE_MIN_DISTANCE')
  minDistance: number = 5; // 10 → 5 (aniqroq route)

  @Value('ROUTE_SEGMENT_GAP_MINUTES')
  segmentGapMinutes: number = 30;

  @Value('ROUTE_MAX_DISTANCE')
  maxDistance: number = 500;

  @Value('ROUTE_SMOOTH_POINTS')
  smoothPoints: number = 3; // boshi/oxiri smooth uchun
}

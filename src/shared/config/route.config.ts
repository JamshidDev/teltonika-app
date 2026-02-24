// src/config/route.config.ts
import { Configuration, Value } from '@itgorillaz/configify';

@Configuration()
export class RouteConfig {
  @Value('ROUTE_MIN_SPEED')
  minSpeed: number = 10;

  @Value('ROUTE_MIN_DISTANCE')
  minDistance: number = 10;

  @Value('ROUTE_SEGMENT_GAP_MINUTES')
  segmentGapMinutes: number = 30;
}

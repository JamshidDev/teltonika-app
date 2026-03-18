import { Injectable } from '@nestjs/common';

@Injectable()
export class RouteConfig {
  minSpeed: number = Number(process.env.ROUTE_MIN_SPEED) || 1;
  minDistance: number = Number(process.env.ROUTE_MIN_DISTANCE) || 5;
  segmentGapMinutes: number = Number(process.env.ROUTE_SEGMENT_GAP_MINUTES) || 30;
  maxDistance: number = Number(process.env.ROUTE_MAX_DISTANCE) || 500;
  smoothPoints: number = Number(process.env.ROUTE_SMOOTH_POINTS) || 3;
  maxSnapDistance: number = Number(process.env.ROUTE_MAX_SNAP_DISTANCE) || 200;
  jitterThreshold: number = Number(process.env.ROUTE_JITTER_THRESHOLD) || 15;
}

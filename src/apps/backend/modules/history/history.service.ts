import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import {
  carPositions,
  cars,
  carStopEvents,
  devices,
  drivers,
} from '@/shared/database/schema';
import { and, between, count, desc, eq, or, sql } from 'drizzle-orm';
import { CarHistoryDto, CarRouteDto } from './history.dto';
import simplify from '@turf/simplify';
import { lineString } from '@turf/helpers';
import { RouteConfig } from '@config/route.config';

interface RoutePoint {
  lat: number;
  lng: number;
  speed: number | null;
  angle: number | null;
  recordedAt: Date;
}

interface TimelineRoute {
  type: 'route';
  points: RoutePoint[];
}

interface TimelineEvent {
  type: 'stop' | 'parking';
  lat: number;
  lng: number;
  startAt: string;
  endAt: string | null;
  duration: number | null;
}

type TimelineItem = TimelineRoute | TimelineEvent;

@Injectable()
export class HistoryService {
  constructor(
    @InjectDb() private db: DataSource,
    private readonly routeConfig: RouteConfig,
  ) {}

  async getCarPositions(dto: CarHistoryDto) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const whereClause = dto.carId
      ? eq(carPositions.carId, dto.carId)
      : undefined;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: carPositions.id,
          carId: carPositions.carId,
          carName: cars.name,
          carNumber: cars.carNumber,
          latitude: carPositions.latitude,
          longitude: carPositions.longitude,
          speed: carPositions.speed,
          angle: carPositions.angle,
          satellites: carPositions.satellites,
          ignition: carPositions.ignition,
          recordedAt: carPositions.recordedAt,
          createdAt: carPositions.createdAt,
          bytesReceived: carPositions.bytesReceived,
          distanceFromPrev: carPositions.distanceFromPrev,
          rawIo: carPositions.rawIo,
          device: {
            id: devices.id,
            imei: devices.imei,
            model: devices.model,
          },
          driver: {
            id: drivers.id,
            fullName: drivers.fullName,
            phone: drivers.phone,
          },
        })
        .from(carPositions)
        .leftJoin(cars, eq(carPositions.carId, cars.id))
        .leftJoin(devices, eq(carPositions.deviceId, devices.id))
        .leftJoin(drivers, eq(carPositions.driverId, drivers.id))
        .where(whereClause)
        .orderBy(desc(carPositions.createdAt))
        .offset(offset)
        .limit(pageSize),

      this.db.select({ total: count() }).from(carPositions).where(whereClause),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getCarRoute(dto: CarRouteDto) {
    const result = await this.db.execute(sql`
      WITH ranked AS (SELECT latitude,
                             longitude,
                             speed,
                             angle,
                             recorded_at,
                             LAG(ST_MakePoint(longitude, latitude)::geography)
                               OVER (ORDER BY recorded_at) as prev_point
                      FROM car_positions
                      WHERE car_id = ${dto.carId}
                        AND recorded_at BETWEEN ${new Date(dto.from)} AND ${new Date(dto.to)}
                        AND latitude
        != 0 AND longitude != 0
        AND ignition = true
        AND speed
         > ${this.routeConfig.minSpeed}
        )
      SELECT latitude    as lat,
             longitude   as lng,
             speed,
             angle,
             recorded_at as "recordedAt"
      FROM ranked
      WHERE prev_point IS NULL
         OR ST_Distance(
              ST_MakePoint(longitude, latitude)::geography,
              prev_point
            ) > ${this.routeConfig.minDistance}
      ORDER BY recorded_at ASC
    `);

    const points = result.rows as {
      lat: number;
      lng: number;
      speed: number | null;
      angle: number | null;
      recordedAt: Date;
    }[];

    if (points.length < 2) return points;

    const line = lineString(points.map((p) => [p.lng, p.lat]));
    const simplified = simplify(line, { tolerance: 0.0001, highQuality: true });

    const simplifiedCoords = new Set(
      simplified.geometry.coordinates.map(([lng, lat]) => `${lat},${lng}`),
    );

    return points.filter((p) => simplifiedCoords.has(`${p.lat},${p.lng}`));
  }

  async getCarRouteWithEvents(carId: number, from: string, to: string) {
    const dayStart = new Date(from);
    const dayEnd = new Date(to);

    // 1. Stop/parking eventlar
    const events = await this.db
      .select({
        type: carStopEvents.type,
        startAt: carStopEvents.startAt,
        endAt: carStopEvents.endAt,
        durationSeconds: carStopEvents.durationSeconds,
        lat: carStopEvents.latitude,
        lng: carStopEvents.longitude,
      })
      .from(carStopEvents)
      .where(
        and(
          eq(carStopEvents.carId, carId),
          or(
            between(carStopEvents.startAt, dayStart, dayEnd),
            and(
              sql`${carStopEvents.startAt}
              <
              ${dayStart}`,
              or(
                between(carStopEvents.endAt, dayStart, dayEnd),
                sql`${carStopEvents.endAt}
                IS NULL`,
              ),
            ),
          ),
        ),
      )
      .orderBy(carStopEvents.startAt);

    // 2. Route nuqtalari
    const routeResult = await this.db.execute(sql`
      WITH ranked AS (SELECT latitude,
                             longitude,
                             speed,
                             angle,
                             recorded_at,
                             LAG(ST_MakePoint(longitude, latitude)::geography)
                               OVER (ORDER BY recorded_at) as prev_point
                      FROM car_positions
                      WHERE car_id = ${carId}
                        AND recorded_at BETWEEN ${dayStart} AND ${dayEnd}
                        AND latitude
        != 0 AND longitude != 0
        AND ignition = true
        AND speed
         > ${this.routeConfig.minSpeed}
        )
      SELECT latitude    as lat,
             longitude   as lng,
             speed,
             angle,
             recorded_at as "recordedAt"
      FROM ranked
      WHERE prev_point IS NULL
         OR ST_Distance(
              ST_MakePoint(longitude, latitude)::geography,
              prev_point
            ) > ${this.routeConfig.minDistance}
      ORDER BY recorded_at ASC
    `);

    const routePoints = routeResult.rows as unknown as RoutePoint[];

    // 3. Timeline yaratish
    const timeline = this.buildTimeline(routePoints, events);

    return {
      carId,
      from,
      to,
      totalEvents: events.length,
      totalRoutePoints: routePoints.length,
      timeline,
    };
  }

  private buildTimeline(
    points: RoutePoint[],
    events: {
      type: string | null;
      startAt: Date;
      endAt: Date | null;
      durationSeconds: number | null;
      lat: number | null;
      lng: number | null;
    }[],
  ): TimelineItem[] {
    if (points.length === 0 && events.length === 0) return [];

    const sortedEvents = events.map((e) => ({
      type: (e.type ?? 'stop') as 'stop' | 'parking',
      startAt: e.startAt,
      endAt: e.endAt,
      durationSeconds: e.durationSeconds,
      lat: e.lat ?? 0,
      lng: e.lng ?? 0,
    }));

    const timeline: TimelineItem[] = [];
    let pointIndex = 0;

    for (const event of sortedEvents) {
      // Event oldidagi route nuqtalari
      const segment: RoutePoint[] = [];
      while (
        pointIndex < points.length &&
        new Date(points[pointIndex].recordedAt).getTime() <
          event.startAt.getTime()
      ) {
        segment.push(points[pointIndex]);
        pointIndex++;
      }

      if (segment.length >= 2) {
        timeline.push({
          type: 'route',
          points: this.simplifyRoute(segment),
        });
      }

      // Event marker
      timeline.push({
        type: event.type,
        lat: event.lat,
        lng: event.lng,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt?.toISOString() ?? null,
        duration: event.durationSeconds,
      });

      // Event davomidagi nuqtalarni o'tkazish
      if (event.endAt) {
        while (
          pointIndex < points.length &&
          new Date(points[pointIndex].recordedAt).getTime() <=
            event.endAt.getTime()
        ) {
          pointIndex++;
        }
      }
    }

    // Oxirgi eventdan keyingi qolgan nuqtalar
    const remaining: RoutePoint[] = [];
    while (pointIndex < points.length) {
      remaining.push(points[pointIndex]);
      pointIndex++;
    }

    if (remaining.length >= 2) {
      timeline.push({
        type: 'route',
        points: this.simplifyRoute(remaining),
      });
    }

    return timeline;
  }

  private simplifyRoute(points: RoutePoint[]): RoutePoint[] {
    if (points.length < 2) return points;

    const line = lineString(points.map((p) => [p.lng, p.lat]));
    const simplified = simplify(line, { tolerance: 0.0001, highQuality: true });

    const simplifiedCoords = new Set(
      simplified.geometry.coordinates.map(([lng, lat]) => `${lat},${lng}`),
    );

    return points.filter((p) => simplifiedCoords.has(`${p.lat},${p.lng}`));
  }
}

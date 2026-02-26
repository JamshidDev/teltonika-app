import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carPositions, cars, devices, drivers } from '@/shared/database/schema';
import { count, desc, eq, sql } from 'drizzle-orm';
import { CarHistoryDto, CarRouteDto } from './history.dto';
import simplify from '@turf/simplify';
import { lineString } from '@turf/helpers';
import { RouteConfig } from '@config/route.config';

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
    WITH ranked AS (
      SELECT 
        latitude, longitude, speed, angle, recorded_at,
        LAG(ST_MakePoint(longitude, latitude)::geography) 
          OVER (ORDER BY recorded_at) as prev_point
      FROM car_positions
      WHERE car_id = ${dto.carId}
        AND recorded_at BETWEEN ${new Date(dto.from)} AND ${new Date(dto.to)}
        AND latitude != 0 AND longitude != 0
        AND ignition = true
        AND speed > ${this.routeConfig.minSpeed}
    )
    SELECT 
      latitude as lat,
      longitude as lng,
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
}

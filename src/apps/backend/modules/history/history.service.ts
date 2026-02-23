import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carPositions, cars } from '@/shared/database/schema';
import { and, asc, between, count, desc, eq } from 'drizzle-orm';
import { CarHistoryDto, CarRouteDto } from './history.dto';
import simplify from '@turf/simplify';
import { lineString } from '@turf/helpers';

@Injectable()
export class HistoryService {
  constructor(@InjectDb() private db: DataSource) {}

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
          deviceImei: cars.deviceImei,
          latitude: carPositions.latitude,
          longitude: carPositions.longitude,
          speed: carPositions.speed,
          angle: carPositions.angle,
          satellites: carPositions.satellites,
          ignition: carPositions.ignition,
          recordedAt: carPositions.recordedAt,
          createdAt: carPositions.createdAt,
          rawIo: carPositions.rawIo,
        })
        .from(carPositions)
        .leftJoin(cars, eq(carPositions.carId, cars.id))
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
    const data = await this.db
      .select({
        lat: carPositions.latitude,
        lng: carPositions.longitude,
        speed: carPositions.speed,
        recordedAt: carPositions.recordedAt,
        angle: carPositions.angle,
      })
      .from(carPositions)
      .where(
        and(
          eq(carPositions.carId, dto.carId),
          between(
            carPositions.recordedAt,
            new Date(dto.from),
            new Date(dto.to),
          ),
        ),
      )
      .orderBy(asc(carPositions.recordedAt));

    if (data.length < 2) return data;
    const validData = data.filter((p) => p.lat !== 0 && p.lng !== 0);
    if (validData.length < 2) return validData;
    const line = lineString(validData.map((p) => [p.lng, p.lat]));
    const simplified = simplify(line, { tolerance: 0.0001, highQuality: true });

    const simplifiedCoords = new Set(
      simplified.geometry.coordinates.map(([lng, lat]) => `${lat},${lng}`),
    );

    return validData.filter((p) => simplifiedCoords.has(`${p.lat},${p.lng}`));
  }
}

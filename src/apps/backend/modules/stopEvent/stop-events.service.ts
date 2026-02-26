import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { cars, carStopEvents } from '@/shared/database/schema';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { StopEventsQueryDto } from './stop-events.dto';

@Injectable()
export class StopEventsService {
  constructor(@InjectDb() private db: DataSource) {}

  async findAll(dto: StopEventsQueryDto) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const conditions: SQL[] = [];

    if (dto.carId) {
      conditions.push(eq(carStopEvents.carId, dto.carId));
    }

    if (dto.date) {
      const dayStart = new Date(`${dto.date}T00:00:00.000Z`);
      const dayEnd = new Date(`${dto.date}T23:59:59.999Z`);
      conditions.push(gte(carStopEvents.startAt, dayStart));
      conditions.push(lte(carStopEvents.startAt, dayEnd));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: carStopEvents.id,
          carId: carStopEvents.carId,
          carName: cars.name,
          type: carStopEvents.type,
          startAt: carStopEvents.startAt,
          endAt: carStopEvents.endAt,
          durationSeconds: carStopEvents.durationSeconds,
          latitude: carStopEvents.latitude,
          longitude: carStopEvents.longitude,
        })
        .from(carStopEvents)
        .leftJoin(cars, eq(carStopEvents.carId, cars.id))
        .where(whereClause)
        .orderBy(desc(carStopEvents.startAt))
        .offset(offset)
        .limit(pageSize),

      this.db.select({ total: count() }).from(carStopEvents).where(whereClause),
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
}

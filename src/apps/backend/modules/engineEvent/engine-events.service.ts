import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carEngineEvents, cars } from '@/shared/database/schema';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { EngineEventsQueryDto } from './engine-events.dto';

@Injectable()
export class EngineEventsService {
  constructor(@InjectDb() private db: DataSource) {}

  async findAll(dto: EngineEventsQueryDto, userId: number) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;

    // Faqat shu foydalanuvchining mashinalari.
    const conditions: SQL[] = [];

    if (dto.carId) {
      conditions.push(eq(carEngineEvents.carId, dto.carId));
    }

    if (dto.date) {
      const dayStart = new Date(`${dto.date}T00:00:00.000Z`);
      const dayEnd = new Date(`${dto.date}T23:59:59.999Z`);
      conditions.push(gte(carEngineEvents.eventAt, dayStart));
      conditions.push(lte(carEngineEvents.eventAt, dayEnd));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: carEngineEvents.id,
          carId: carEngineEvents.carId,
          carName: cars.name,
          carNumber: cars.carNumber,
          eventType: carEngineEvents.eventType,
          eventAt: carEngineEvents.eventAt,
          latitude: carEngineEvents.latitude,
          longitude: carEngineEvents.longitude,
        })
        .from(carEngineEvents)
        .innerJoin(cars, eq(carEngineEvents.carId, cars.id))
        .where(whereClause)
        .orderBy(desc(carEngineEvents.eventAt))
        .offset(offset)
        .limit(pageSize),

      this.db
        .select({ total: count() })
        .from(carEngineEvents)
        .innerJoin(cars, eq(carEngineEvents.carId, cars.id))
        .where(whereClause),
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
// src/cars/cars.service.ts
import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carLastPositions, cars } from '@/shared/database/schema';
import { eq, count } from 'drizzle-orm';
import { paginate } from '@/shared/helper/paginate';
import { PaginationDto } from '@/shared/dto/common.dto';
import {
  CreateCarDto,
  UpdateCarDto,
} from '@/apps/backend/modules/cars/car.dto';

@Injectable()
export class CarService {
  constructor(@InjectDb() private db: DataSource) {}

  async findAll(dto: PaginationDto) {
    return await paginate(this.db, cars)
      .page(dto.page)
      .pageSize(dto.pageSize)
      .execute();
  }

  async create(dto: CreateCarDto) {
    const result = await this.db
      .insert(cars)
      .values({
        userId: dto.userId,
        name: dto.name,
        deviceImei: dto.deviceImei,
        deviceModel: dto.deviceModel,
      })
      .returning();
    return result[0];
  }

  async update(id: number, dto: UpdateCarDto) {
    const result = await this.db
      .update(cars)
      .set(dto)
      .where(eq(cars.id, id))
      .returning();
    return result[0] ?? null;
  }

  async remove(id: number) {
    await this.db.delete(cars).where(eq(cars.id, id));
    return { deleted: true };
  }

  async findOne(id: number) {
    const result = await this.db
      .select()
      .from(cars)
      .where(eq(cars.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  async getLastPositions(dto: PaginationDto) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          carId: cars.id,
          name: cars.name,
          deviceImei: cars.deviceImei,
          deviceModel: cars.deviceModel,
          lat: carLastPositions.latitude,
          lng: carLastPositions.longitude,
          speed: carLastPositions.speed,
          angle: carLastPositions.angle,
          ignition: carLastPositions.ignition,
          movement: carLastPositions.movement,
          recordedAt: carLastPositions.recordedAt,
        })
        .from(cars)
        .leftJoin(carLastPositions, eq(cars.id, carLastPositions.carId))
        .offset(offset)
        .limit(pageSize),

      this.db.select({ total: count() }).from(cars),
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

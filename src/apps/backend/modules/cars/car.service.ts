// src/cars/cars.service.ts
import { Injectable } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { cars } from '@/shared/database/schema';
import { eq } from 'drizzle-orm';
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
}

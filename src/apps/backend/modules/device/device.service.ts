// device.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { devices } from '@/shared/database/schema';
import { and, count, eq, isNull } from 'drizzle-orm';
import { PaginationDto } from '@/shared/dto/common.dto';
import { CreateDeviceDto, UpdateDeviceDto } from './device.dto';

@Injectable()
export class DeviceService {
  constructor(@InjectDb() private db: DataSource) {}

  async findAll(dto: PaginationDto) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const [data, countResult] = await Promise.all([
      this.db
        .select()
        .from(devices)
        .where(isNull(devices.deletedAt))
        .offset(offset)
        .limit(pageSize),

      this.db
        .select({ total: count() })
        .from(devices)
        .where(isNull(devices.deletedAt)),
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

  async findOne(id: number) {
    const result = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, id), isNull(devices.deletedAt)))
      .limit(1);

    if (!result[0]) {
      throw new NotFoundException('Device topilmadi');
    }

    return result[0];
  }

  async create(dto: CreateDeviceDto) {
    const existing = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.imei, dto.imei), isNull(devices.deletedAt)))
      .limit(1);

    if (existing[0]) {
      throw new ConflictException('Bu IMEI allaqachon mavjud');
    }

    const [device] = await this.db
      .insert(devices)
      .values({
        imei: dto.imei,
        model: dto.model,
      })
      .returning();

    return device;
  }

  async update(id: number, dto: UpdateDeviceDto) {
    const existing = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, id), isNull(devices.deletedAt)))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException('Device topilmadi');
    }

    if (dto.imei) {
      const imeiExists = await this.db
        .select()
        .from(devices)
        .where(and(eq(devices.imei, dto.imei), isNull(devices.deletedAt)))
        .limit(1);

      if (imeiExists[0] && imeiExists[0].id !== id) {
        throw new ConflictException('Bu IMEI allaqachon mavjud');
      }
    }

    const [updated] = await this.db
      .update(devices)
      .set({
        imei: dto.imei,
        model: dto.model,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    return updated;
  }

  async remove(id: number) {
    const existing = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, id), isNull(devices.deletedAt)))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException('Device topilmadi');
    }

    await this.db
      .update(devices)
      .set({ deletedAt: new Date() })
      .where(eq(devices.id, id));

    return { deleted: true };
  }
}

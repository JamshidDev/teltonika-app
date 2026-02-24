import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carDevices, devices } from '@/shared/database/schema';
import { and, count, eq, isNull } from 'drizzle-orm';
import { PaginationDto } from '@/shared/dto/common.dto';
import { CreateDeviceDto, UpdateDeviceDto } from './device.dto';

@Injectable()
export class DeviceService {
  constructor(@InjectDb() private db: DataSource) {}

  private async isDeviceInUse(id: number): Promise<boolean> {
    const result = await this.db
      .select()
      .from(carDevices)
      .where(and(eq(carDevices.deviceId, id), isNull(carDevices.endAt)))
      .limit(1);
    return !!result[0];
  }

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

    // Carga biriktirilgan bo'lsa IMEI o'zgartirishga ruxsat yo'q
    if (dto.imei && dto.imei !== existing[0].imei) {
      const inUse = await this.isDeviceInUse(id);
      if (inUse) {
        throw new BadRequestException(
          "Device mashinaga biriktirilgan, IMEI ni o'zgartirish mumkin emas",
        );
      }
    }

    const [updated] = await this.db
      .update(devices)
      .set({
        imei: dto.imei ?? existing[0].imei,
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

    // Carga biriktirilgan bo'lsa o'chirish mumkin emas
    const inUse = await this.isDeviceInUse(id);
    if (inUse) {
      throw new BadRequestException(
        'Device mashinaga biriktirilgan, avval mashinadan uzib oling',
      );
    }

    await this.db
      .update(devices)
      .set({ deletedAt: new Date() })
      .where(eq(devices.id, id));

    return { deleted: true };
  }
}

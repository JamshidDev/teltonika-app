import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carDrivers, drivers } from '@/shared/database/schema';
import { and, count, eq, isNull } from 'drizzle-orm';
import { PaginationDto } from '@/shared/dto/common.dto';
import { CreateDriverDto, UpdateDriverDto } from './driver.dto';

@Injectable()
export class DriverService {
  constructor(@InjectDb() private db: DataSource) {}

  private async isDriverInUse(id: number): Promise<boolean> {
    const result = await this.db
      .select()
      .from(carDrivers)
      .where(and(eq(carDrivers.driverId, id), isNull(carDrivers.endAt)))
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
        .from(drivers)
        .where(isNull(drivers.deletedAt))
        .offset(offset)
        .limit(pageSize),

      this.db
        .select({ total: count() })
        .from(drivers)
        .where(isNull(drivers.deletedAt)),
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
      .from(drivers)
      .where(and(eq(drivers.id, id), isNull(drivers.deletedAt)))
      .limit(1);

    if (!result[0]) {
      throw new NotFoundException('Haydovchi topilmadi');
    }

    return result[0];
  }

  async create(dto: CreateDriverDto) {
    if (dto.phone) {
      const existing = await this.db
        .select()
        .from(drivers)
        .where(and(eq(drivers.phone, dto.phone), isNull(drivers.deletedAt)))
        .limit(1);

      if (existing[0]) {
        throw new ConflictException('Bu telefon raqam allaqachon mavjud');
      }
    }

    const [driver] = await this.db
      .insert(drivers)
      .values({
        fullName: dto.fullName,
        phone: dto.phone,
        licenseNumber: dto.licenseNumber,
      })
      .returning();

    return driver;
  }

  async update(id: number, dto: UpdateDriverDto) {
    const existing = await this.db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, id), isNull(drivers.deletedAt)))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException('Haydovchi topilmadi');
    }

    const [updated] = await this.db
      .update(drivers)
      .set({
        fullName: dto.fullName,
        phone: dto.phone,
        licenseNumber: dto.licenseNumber,
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, id))
      .returning();

    return updated;
  }

  async remove(id: number) {
    const existing = await this.db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, id), isNull(drivers.deletedAt)))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException('Haydovchi topilmadi');
    }

    const inUse = await this.isDriverInUse(id);
    if (inUse) {
      throw new BadRequestException(
        'Haydovchi mashinaga biriktirilgan, avval mashinadan uzib oling',
      );
    }

    await this.db
      .update(drivers)
      .set({ deletedAt: new Date() })
      .where(eq(drivers.id, id));

    return { deleted: true };
  }
}

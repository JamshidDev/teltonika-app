import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import {
  carDevices,
  carDrivers,
  carLastPositions,
  cars,
  devices,
  drivers,
} from '@/shared/database/schema';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { PaginationDto } from '@/shared/dto/common.dto';
import {
  CreateCarDto,
  UpdateCarDto,
} from '@/apps/backend/modules/cars/car.dto';

@Injectable()
export class CarService {
  constructor(@InjectDb() private db: DataSource) {}

  async findAll(dto: PaginationDto) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const [data, countResult] = await Promise.all([
      this.db
        .select({
          id: cars.id,
          userId: cars.userId,
          name: cars.name,
          carNumber: cars.carNumber,
          createdAt: cars.createdAt,
          updatedAt: cars.updatedAt,
          device: devices,
          driver: drivers,
        })
        .from(cars)
        .leftJoin(
          carDevices,
          and(eq(carDevices.carId, cars.id), isNull(carDevices.endAt)),
        )
        .leftJoin(devices, eq(devices.id, carDevices.deviceId))
        .leftJoin(
          carDrivers,
          and(eq(carDrivers.carId, cars.id), isNull(carDrivers.endAt)),
        )
        .leftJoin(drivers, eq(drivers.id, carDrivers.driverId))
        .where(isNull(cars.deletedAt))
        .offset(offset)
        .limit(pageSize),

      this.db
        .select({ total: count() })
        .from(cars)
        .where(isNull(cars.deletedAt)),
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

  async create(dto: CreateCarDto) {
    const device = await this.db
      .select()
      .from(devices)
      .where(eq(devices.id, dto.deviceId))
      .limit(1);

    if (!device[0]) {
      throw new NotFoundException('Device topilmadi');
    }

    const deviceInUse = await this.db
      .select()
      .from(carDevices)
      .where(
        and(eq(carDevices.deviceId, dto.deviceId), isNull(carDevices.endAt)),
      )
      .limit(1);

    if (deviceInUse[0]) {
      throw new ConflictException('Bu device boshqa mashinaga biriktirilgan');
    }

    const [car] = await this.db
      .insert(cars)
      .values({
        userId: dto.userId,
        name: dto.name,
        carNumber: dto.carNumber,
      })
      .returning();

    await this.db.insert(carDevices).values({
      carId: car.id,
      deviceId: dto.deviceId,
    });

    if (dto.driverId) {
      await this.db.insert(carDrivers).values({
        carId: car.id,
        driverId: dto.driverId,
      });
    }

    return car;
  }

  async update(id: number, dto: UpdateCarDto) {
    const existing = await this.db
      .select()
      .from(cars)
      .where(and(eq(cars.id, id), isNull(cars.deletedAt)))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException('Mashina topilmadi');
    }

    const [updated] = await this.db
      .update(cars)
      .set({
        name: dto.name,
        carNumber: dto.carNumber,
        updatedAt: new Date(),
      })
      .where(eq(cars.id, id))
      .returning();

    if (dto.deviceId) {
      const currentDevice = await this.db
        .select()
        .from(carDevices)
        .where(and(eq(carDevices.carId, id), isNull(carDevices.endAt)))
        .limit(1);

      if (currentDevice[0]?.deviceId !== dto.deviceId) {
        await this.db
          .update(carDevices)
          .set({ endAt: new Date() })
          .where(and(eq(carDevices.carId, id), isNull(carDevices.endAt)));

        await this.db.insert(carDevices).values({
          carId: id,
          deviceId: dto.deviceId,
        });
      }
    }

    if (dto.driverId) {
      const currentDriver = await this.db
        .select()
        .from(carDrivers)
        .where(and(eq(carDrivers.carId, id), isNull(carDrivers.endAt)))
        .limit(1);

      if (currentDriver[0]?.driverId !== dto.driverId) {
        await this.db
          .update(carDrivers)
          .set({ endAt: new Date() })
          .where(and(eq(carDrivers.carId, id), isNull(carDrivers.endAt)));

        await this.db.insert(carDrivers).values({
          carId: id,
          driverId: dto.driverId,
        });
      }
    }

    return updated;
  }

  async remove(id: number) {
    const existing = await this.db
      .select()
      .from(cars)
      .where(and(eq(cars.id, id), isNull(cars.deletedAt)))
      .limit(1);

    if (!existing[0]) {
      throw new NotFoundException('Mashina topilmadi');
    }

    const now = new Date();

    await Promise.all([
      this.db.update(cars).set({ deletedAt: now }).where(eq(cars.id, id)),

      this.db
        .update(carDevices)
        .set({ endAt: now })
        .where(and(eq(carDevices.carId, id), isNull(carDevices.endAt))),

      this.db
        .update(carDrivers)
        .set({ endAt: now })
        .where(and(eq(carDrivers.carId, id), isNull(carDrivers.endAt))),
    ]);

    return { deleted: true };
  }

  async findOne(id: number) {
    const result = await this.db
      .select()
      .from(cars)
      .where(and(eq(cars.id, id), isNull(cars.deletedAt)))
      .limit(1);

    if (!result[0]) {
      throw new NotFoundException('Mashina topilmadi');
    }

    return result[0];
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
          carNumber: cars.carNumber,
          lat: carLastPositions.latitude,
          lng: carLastPositions.longitude,
          speed: carLastPositions.speed,
          angle: carLastPositions.angle,
          ignition: carLastPositions.ignition,
          movement: carLastPositions.movement,
          recordedAt: carLastPositions.recordedAt,
        })
        .from(cars)
        .innerJoin(carLastPositions, eq(cars.id, carLastPositions.carId))
        .where(isNull(cars.deletedAt))
        .orderBy(
          sql`${carLastPositions.updatedAt}
          DESC NULLS LAST`,
        )
        .offset(offset)
        .limit(pageSize),

      this.db
        .select({ total: count() })
        .from(cars)
        .innerJoin(carLastPositions, eq(cars.id, carLastPositions.carId))
        .where(isNull(cars.deletedAt)),
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

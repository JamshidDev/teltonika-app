// src/teltonika/position.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carPositions, cars } from '@/shared/database/schema';
import { eq } from 'drizzle-orm';
import { GpsRecord } from './codec8.parser';

@Injectable()
export class PositionService {
  private readonly logger = new Logger('Position');

  constructor(@InjectDb() private db: DataSource) {}

  async findCarByImei(imei: string) {
    const result = await this.db
      .select()
      .from(cars)
      .where(eq(cars.deviceImei, imei))
      .limit(1);
    console.log('Car result:', result); // ← shu qo'shing

    return result[0] ?? null;
  }

  async saveRecords(carId: number, records: GpsRecord[]) {
    await this.db.insert(carPositions).values(
      records.map((r) => ({
        carId,
        latitude: r.lat,
        longitude: r.lng,
        speed: r.speed,
        angle: r.angle,
        satellites: r.satellites,
        ignition: r.io.ignition,
        recordedAt: r.timestamp,
      })),
    );

    this.logger.log(`${records.length} ta position saqlandi (car: ${carId})`);
  }
}

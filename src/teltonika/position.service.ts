// src/teltonika/position.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { carLastPositions, carPositions, cars } from '@/shared/database/schema';
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

    return result[0] ?? null;
  }

  async saveRecords(carId: number, records: GpsRecord[]) {
    try {
      this.logger.log(
        `saveRecords boshlandi, carId: ${carId}, records: ${records.length}`,
      );

      await this.db.insert(carPositions).values(
        records.map((r) => ({
          carId,
          latitude: r.lat,
          longitude: r.lng,
          speed: r.speed,
          angle: r.angle,
          satellites: r.satellites,
          ignition: r.io.ignition,
          rawIo: r.rawIo,
          recordedAt: new Date(r.timestamp),
        })),
      );

      const last = records[records.length - 1];
      await this.db
        .insert(carLastPositions)
        .values({
          carId,
          latitude: last.lat,
          longitude: last.lng,
          speed: last.speed,
          angle: last.angle,
          altitude: last.altitude,
          satellites: last.satellites,
          ignition: last.io.ignition,
          movement: last.io.movement,
          odometer: last.io.totalOdometer,
          gsmSignal: last.io.gsmSignal,
          batteryVoltage: last.io.batteryVoltage,
          extVoltage: last.io.externalVoltage,
          recordedAt: new Date(last.timestamp),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: carLastPositions.carId,
          set: {
            latitude: last.lat,
            longitude: last.lng,
            speed: last.speed,
            angle: last.angle,
            altitude: last.altitude,
            satellites: last.satellites,
            ignition: last.io.ignition,
            movement: last.io.movement,
            odometer: last.io.totalOdometer,
            gsmSignal: last.io.gsmSignal,
            batteryVoltage: last.io.batteryVoltage,
            extVoltage: last.io.externalVoltage,
            recordedAt: new Date(last.timestamp),
            updatedAt: new Date(),
          },
        });
      this.logger.log('carLastPositions saqlandi ✅');
    } catch (error) {
      this.logger.error('carLastPositions xato:', error);
      console.log(error);
    }
  }
}

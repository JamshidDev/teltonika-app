import { Injectable, Logger } from '@nestjs/common';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import {
  carDevices,
  carDrivers,
  carEngineEvents,
  carLastPositions,
  carPositions,
  cars,
  carStopEvents,
  devices,
} from '@/shared/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { GpsRecord } from './codec8.parser';

@Injectable()
export class PositionService {
  private readonly logger = new Logger('Position');

  constructor(@InjectDb() private db: DataSource) {}

  async findCarByImei(imei: string) {
    const cleanImei = imei.replace(/[^\x20-\x7E]/g, '').trim();

    const result = await this.db
      .select({
        id: cars.id,
        name: cars.name,
        deviceId: carDevices.deviceId,
      })
      .from(devices)
      .innerJoin(
        carDevices,
        and(eq(carDevices.deviceId, devices.id), isNull(carDevices.endAt)),
      )
      .innerJoin(cars, eq(cars.id, carDevices.carId))
      .where(eq(devices.imei, cleanImei))
      .limit(1);

    return result[0] ?? null;
  }

  async saveRecords(
    carId: number,
    records: GpsRecord[],
    deviceId?: number | null,
  ) {
    try {
      this.logger.log(
        `saveRecords boshlandi, carId: ${carId}, records: ${records.length}`,
      );

      // 1. Oldingi holatlarni bir marta ol
      const [lastPositionResult, openStopResult, currentDriverResult] =
        await Promise.all([
          this.db
            .select({ ignition: carLastPositions.ignition })
            .from(carLastPositions)
            .where(eq(carLastPositions.carId, carId))
            .limit(1),

          this.db
            .select()
            .from(carStopEvents)
            .where(
              and(eq(carStopEvents.carId, carId), isNull(carStopEvents.endAt)),
            )
            .limit(1),

          this.db
            .select({ driverId: carDrivers.driverId })
            .from(carDrivers)
            .where(and(eq(carDrivers.carId, carId), isNull(carDrivers.endAt)))
            .limit(1),
        ]);

      const prevIgnition = lastPositionResult[0]?.ignition ?? null;
      const driverId = currentDriverResult[0]?.driverId ?? null;
      let openStop: (typeof openStopResult)[0] | null =
        openStopResult[0] ?? null;

      // 2. Pozitsiyalarni saqlash
      await this.db.insert(carPositions).values(
        records.map((r) => ({
          carId,
          deviceId: deviceId ?? null,
          driverId: driverId ?? null,
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

      // 3. Engine va Stop eventlarni yig'ish
      const engineEvents: (typeof carEngineEvents.$inferInsert)[] = [];
      const stopInserts: (typeof carStopEvents.$inferInsert)[] = [];
      const stopUpdates: {
        id: number;
        endAt: Date;
        durationSeconds: number;
      }[] = [];

      let currentIgnition = prevIgnition;

      for (const record of records) {
        const currIgnition = record.io.ignition;
        const isStopped =
          (record.speed ?? 0) === 0 && record.io.movement === false;
        const recordTime = new Date(record.timestamp);

        // Engine event
        if (currIgnition !== null) {
          if (currentIgnition === false && currIgnition) {
            this.logger.log(`Engine ON: carId=${carId}`);
            engineEvents.push({
              carId,
              eventType: 'on',
              eventAt: recordTime,
              latitude: record.lat,
              longitude: record.lng,
            });
          } else if (currentIgnition === true && !currIgnition) {
            this.logger.log(`Engine OFF: carId=${carId}`);
            engineEvents.push({
              carId,
              eventType: 'off',
              eventAt: recordTime,
              latitude: record.lat,
              longitude: record.lng,
            });
          }
          currentIgnition = currIgnition;
        }

        // Stop event
        if (isStopped && !openStop) {
          const newStop = {
            carId,
            startAt: recordTime,
            latitude: record.lat,
            longitude: record.lng,
          };
          stopInserts.push(newStop);
          openStop = { id: -1, endAt: null, durationSeconds: null, ...newStop };
          this.logger.log(`Stop boshladi: carId=${carId}`);
        } else if (!isStopped && openStop) {
          const durationSeconds = Math.floor(
            (recordTime.getTime() - openStop.startAt.getTime()) / 1000,
          );

          if (openStop.id !== -1) {
            stopUpdates.push({
              id: openStop.id,
              endAt: recordTime,
              durationSeconds,
            });
          } else {
            const lastInsert = stopInserts[stopInserts.length - 1];
            if (lastInsert) {
              lastInsert.endAt = recordTime;
              lastInsert.durationSeconds = durationSeconds;
            }
          }
          this.logger.log(
            `Stop tugadi: carId=${carId}, davomiyligi: ${durationSeconds}s`,
          );
          openStop = null;
        }
      }

      // 4. Batch insert/update
      if (engineEvents.length > 0) {
        await this.db.insert(carEngineEvents).values(engineEvents);
      }

      if (stopInserts.length > 0) {
        await this.db.insert(carStopEvents).values(stopInserts);
      }

      for (const update of stopUpdates) {
        await this.db
          .update(carStopEvents)
          .set({ endAt: update.endAt, durationSeconds: update.durationSeconds })
          .where(eq(carStopEvents.id, update.id));
      }

      // 5. Oxirgi pozitsiyani upsert
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

      this.logger.log('saveRecords tugadi ✅');
    } catch (error) {
      this.logger.error('saveRecords xato:', error);
      throw error;
    }
  }
}

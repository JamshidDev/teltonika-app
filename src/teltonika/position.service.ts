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
  devices,
} from '@/shared/database/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { GpsRecord } from './codec8.parser';
import { RouteConfig } from '@config/route.config';

@Injectable()
export class PositionService {
  private readonly logger = new Logger('Position');

  constructor(
    @InjectDb() private db: DataSource,
    private readonly routeConfig: RouteConfig,
  ) {}

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

  private async getLastPosition(carId: number) {
    const result = await this.db
      .select({
        latitude: carLastPositions.latitude,
        longitude: carLastPositions.longitude,
      })
      .from(carLastPositions)
      .where(eq(carLastPositions.carId, carId))
      .limit(1);
    return result[0];
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private buildPositionValues(
    carId: number,
    records: GpsRecord[],
    deviceId: number,
    driverId: number | null,
    lastPos: { latitude: number; longitude: number } | undefined,
    bytesReceived?: number,
  ) {
    let prevLat = lastPos?.latitude ?? null;
    let prevLng = lastPos?.longitude ?? null;

    return records.map((r, index) => {
      const distanceFromPrev =
        prevLat !== null && prevLng !== null
          ? this.calculateDistance(prevLat, prevLng, r.lat, r.lng)
          : null;

      const filteredDistance =
        distanceFromPrev !== null &&
        distanceFromPrev > this.routeConfig.maxDistance
          ? null
          : distanceFromPrev;

      prevLat = r.lat;
      prevLng = r.lng;

      return {
        carId,
        deviceId,
        driverId,
        distanceFromPrev: filteredDistance,
        bytesReceived: index === 0 ? (bytesReceived ?? null) : null,
        latitude: r.lat,
        longitude: r.lng,
        speed: r.speed,
        angle: r.angle,
        satellites: r.satellites,
        ignition: r.io.ignition,
        rawIo: r.rawIo,
        recordedAt: new Date(r.timestamp),
      };
    });
  }

  private processEngineEvents(
    carId: number,
    records: GpsRecord[],
    prevIgnition: boolean | null,
  ) {
    const engineEvents: (typeof carEngineEvents.$inferInsert)[] = [];
    let currentIgnition = prevIgnition;

    for (const record of records) {
      const currIgnition = record.io.ignition;
      const recordTime = new Date(record.timestamp);

      if (currIgnition === null) continue;

      // 🔥 1️⃣ Agar DB da ignition yo‘q bo‘lsa (initial state)
      if (currentIgnition === null) {
        this.logger.log(
          `Engine initial state: carId=${carId}, ignition=${currIgnition}`,
        );

        engineEvents.push({
          carId,
          eventType: currIgnition ? 'on' : 'off',
          eventAt: recordTime,
          latitude: record.lat,
          longitude: record.lng,
        });

        currentIgnition = currIgnition;
        continue;
      }

      // 🔥 2️⃣ Oddiy state change
      if (currentIgnition !== currIgnition) {
        this.logger.log(
          `Engine ${currIgnition ? 'ON' : 'OFF'}: carId=${carId}`,
        );

        engineEvents.push({
          carId,
          eventType: currIgnition ? 'on' : 'off',
          eventAt: recordTime,
          latitude: record.lat,
          longitude: record.lng,
        });

        currentIgnition = currIgnition;
      }
    }

    return engineEvents;
  }

  async saveRecords(
    carId: number,
    records: GpsRecord[],
    deviceId: number,
    bytesReceived?: number,
  ) {
    try {
      this.logger.log(
        `saveRecords boshlandi, carId: ${carId}, records: ${records.length}`,
      );

      const [currentDriverResult, lastPos, lastEngineEventResult] =
        await Promise.all([
          this.db
            .select({ driverId: carDrivers.driverId })
            .from(carDrivers)
            .where(and(eq(carDrivers.carId, carId), isNull(carDrivers.endAt)))
            .limit(1),

          this.getLastPosition(carId),

          this.db
            .select({ eventType: carEngineEvents.eventType })
            .from(carEngineEvents)
            .where(eq(carEngineEvents.carId, carId))
            .orderBy(desc(carEngineEvents.eventAt))
            .limit(1),
        ]);

      const prevIgnition =
        lastEngineEventResult[0]?.eventType === 'on'
          ? true
          : lastEngineEventResult[0]?.eventType === 'off'
            ? false
            : null;
      const driverId = currentDriverResult[0]?.driverId ?? null;

      const positionValues = this.buildPositionValues(
        carId,
        records,
        deviceId,
        driverId,
        lastPos,
        bytesReceived,
      );

      const engineEvents = this.processEngineEvents(
        carId,
        records,
        prevIgnition,
      );

      await this.db.transaction(async (tx) => {
        await tx.insert(carPositions).values(positionValues);

        if (engineEvents.length > 0) {
          await tx.insert(carEngineEvents).values(engineEvents);
        }

        if (!records.length) {
          throw Error('No records');
        }
        const last = records[records.length - 1];
        const values = {
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
        };

        await tx
          .insert(carLastPositions)
          .values(values)
          .onConflictDoUpdate({ target: carLastPositions.carId, set: values });
      });

      this.logger.log('saveRecords tugadi ✅');
    } catch (error) {
      this.logger.error('saveRecords xato:', error);
      throw error;
    }
  }
}

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

const ENGINE_DEBOUNCE_SECONDS = 30;

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
    prevEventAt: Date | null,
  ) {
    const engineEvents: (typeof carEngineEvents.$inferInsert)[] = [];
    let currentIgnition = prevIgnition;
    let lastEventTime = prevEventAt;

    for (const record of records) {
      const currIgnition = record.io.ignition;
      const recordTime = new Date(record.timestamp);

      if (currIgnition === null) continue;

      // Initial state — DB da hech narsa yo'q
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
        lastEventTime = recordTime;
        continue;
      }

      // Ignition o'zgarmagan — o'tkazib yubor
      if (currentIgnition === currIgnition) continue;

      // Ignition o'zgardi — debounce tekshir
      const gap = lastEventTime
        ? (recordTime.getTime() - lastEventTime.getTime()) / 1000
        : Infinity;

      if (gap < ENGINE_DEBOUNCE_SECONDS) {
        // Jitter — 30s dan kam vaqt o'tgan
        if (engineEvents.length > 0) {
          // Batch ichidagi oxirgi eventni almashtiramiz
          const last = engineEvents[engineEvents.length - 1];
          last.eventType = currIgnition ? 'on' : 'off';
          last.eventAt = recordTime;
          last.latitude = record.lat;
          last.longitude = record.lng;
          this.logger.debug(
            `Engine debounce (batch): carId=${carId}, almashtirildi → ${currIgnition ? 'ON' : 'OFF'}`,
          );
        } else {
          // DB dagi oxirgi event bilan jitter — o'tkazib yuboramiz
          this.logger.debug(
            `Engine debounce (DB): carId=${carId}, o'tkazib yuborildi`,
          );
        }
      } else {
        // 30s+ o'tgan — haqiqiy o'zgarish
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
        lastEventTime = recordTime;
      }

      currentIgnition = currIgnition;
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
            .select({
              eventType: carEngineEvents.eventType,
              eventAt: carEngineEvents.eventAt,
            })
            .from(carEngineEvents)
            .where(eq(carEngineEvents.carId, carId))
            .orderBy(desc(carEngineEvents.eventAt))
            .limit(1),
        ]);

      const lastEvent = lastEngineEventResult[0];
      const prevIgnition =
        lastEvent?.eventType === 'on'
          ? true
          : lastEvent?.eventType === 'off'
            ? false
            : null;
      const prevEventAt = lastEvent?.eventAt ?? null;
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
        prevEventAt,
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

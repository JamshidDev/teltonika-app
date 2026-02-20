// src/teltonika/codec8.parser.ts
import { Injectable, Logger } from '@nestjs/common';

export interface IoData {
  ignition: boolean | null;
  movement: boolean | null;
  gsmSignal: number | null;
  externalVoltage: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  gnssStatus: number | null;
  pdop: number | null;
  hdop: number | null;
  sleepMode: number | null;
  gsmOperator: number | null;
  totalOdometer: number | null;
}

export interface GpsRecord {
  timestamp: Date;
  priority: number;
  lat: number;
  lng: number;
  altitude: number;
  angle: number;
  satellites: number;
  speed: number;
  io: IoData;
}

@Injectable()
export class Codec8Parser {
  private readonly logger = new Logger('Codec8');

  parse(buf: Buffer): { codecId: number; records: GpsRecord[] } {
    let offset = 0;

    offset += 4; // preamble
    offset += 4; // data length
    const codecId = buf.readUInt8(offset);
    offset += 1;
    const count = buf.readUInt8(offset);
    offset += 1;

    const records: GpsRecord[] = [];

    for (let i = 0; i < count; i++) {
      const timestamp = new Date(Number(buf.readBigInt64BE(offset)));
      offset += 8;
      const priority = buf.readUInt8(offset);
      offset += 1;
      const lng = buf.readInt32BE(offset) / 1e7;
      offset += 4;
      const lat = buf.readInt32BE(offset) / 1e7;
      offset += 4;
      const altitude = buf.readInt16BE(offset);
      offset += 2;
      const angle = buf.readUInt16BE(offset);
      offset += 2;
      const satellites = buf.readUInt8(offset);
      offset += 1;
      const speed = buf.readUInt16BE(offset);
      offset += 2;

      const { ioEvents, newOffset } = this.parseIO(buf, offset);
      offset = newOffset;

      const io: IoData = {
        ignition: ioEvents.has(239) ? ioEvents.get(239) === 1 : null,
        movement: ioEvents.has(240) ? ioEvents.get(240) === 1 : null,
        gsmSignal: ioEvents.get(21) ?? null,
        externalVoltage: ioEvents.get(66) ?? null,
        batteryVoltage: ioEvents.get(67) ?? null,
        batteryCurrent: ioEvents.get(68) ?? null,
        gnssStatus: ioEvents.get(69) ?? null,
        pdop: ioEvents.get(181) ?? null,
        hdop: ioEvents.get(182) ?? null,
        sleepMode: ioEvents.get(200) ?? null,
        gsmOperator: ioEvents.get(241) ?? null,
        totalOdometer: ioEvents.get(16) ?? null,
      };

      this.logger.debug(
        `Record #${i + 1}: ` +
          `time=${timestamp.toISOString()}, lat=${lat}, lng=${lng}, ` +
          `speed=${speed}, angle=${angle}, alt=${altitude}, sat=${satellites}`,
      );
      this.logger.debug(
        `I/O #${i + 1}: ` +
          `ignition=${io.ignition}, movement=${io.movement}, ` +
          `voltage=${io.externalVoltage}mV, battery=${io.batteryVoltage}mV, ` +
          `gsm=${io.gsmSignal}, odometer=${io.totalOdometer}m, sleep=${io.sleepMode}`,
      );

      records.push({
        timestamp,
        priority,
        lat,
        lng,
        altitude,
        angle,
        satellites,
        speed,
        io,
      });
    }

    return { codecId, records };
  }

  private parseIO(buf: Buffer, offset: number) {
    const ioEvents = new Map<number, number>();

    offset += 1; // eventId
    offset += 1; // totalIO

    const c1 = buf.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < c1; i++) {
      ioEvents.set(buf.readUInt8(offset), buf.readUInt8(offset + 1));
      offset += 2;
    }

    const c2 = buf.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < c2; i++) {
      ioEvents.set(buf.readUInt8(offset), buf.readUInt16BE(offset + 1));
      offset += 3;
    }

    const c4 = buf.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < c4; i++) {
      ioEvents.set(buf.readUInt8(offset), buf.readUInt32BE(offset + 1));
      offset += 5;
    }

    const c8 = buf.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < c8; i++) {
      ioEvents.set(
        buf.readUInt8(offset),
        Number(buf.readBigInt64BE(offset + 1)),
      );
      offset += 9;
    }

    return { ioEvents, newOffset: offset };
  }
}

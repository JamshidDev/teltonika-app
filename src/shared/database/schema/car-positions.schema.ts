import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';
import { drivers } from './drivers.schema';
import { devices } from './devices.schema';

export const carPositions = pgTable(
  'car_positions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    carId: bigint('car_id', { mode: 'number' })
      .references(() => cars.id)
      .notNull(),
    driverId: bigint('driver_id', { mode: 'number' }).references(
      () => drivers.id,
    ),
    deviceId: bigint('device_id', { mode: 'number' }).references(
      () => devices.id,
    ),
    distanceFromPrev: doublePrecision('distance_from_prev'),
    bytesReceived: integer('bytes_received'),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    speed: integer('speed'),
    angle: integer('angle'),
    satellites: integer('satellites'),
    ignition: boolean('ignition'),
    rawIo: jsonb('raw_io'),
    recordedAt: timestamp('recorded_at').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    carTimeIdx: index('idx_positions_car_recorded').on(
      table.carId,
      table.recordedAt,
    ),
    timeIdx: index('idx_positions_recorded_at').on(table.recordedAt),
  }),
);

// src/shared/database/schema/car-devices.schema.ts
import {
  bigint,
  bigserial,
  index,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';
import { devices } from './devices.schema';

export const carDevices = pgTable(
  'car_devices',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    carId: bigint('car_id', { mode: 'number' })
      .references(() => cars.id)
      .notNull(),
    deviceId: bigint('device_id', { mode: 'number' })
      .references(() => devices.id)
      .notNull(),
    startAt: timestamp('start_at').defaultNow().notNull(),
    endAt: timestamp('end_at'),
  },
  (table) => ({
    carIdx: index('idx_car_devices_car_id').on(table.carId),
    deviceIdx: index('idx_car_devices_device_id').on(table.deviceId),
    activeIdx: index('idx_car_devices_active').on(table.carId, table.endAt),
  }),
);

// src/shared/database/schema/car-drivers.schema.ts
import {
  bigint,
  bigserial,
  index,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';
import { drivers } from './drivers.schema';

export const carDrivers = pgTable(
  'car_drivers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    carId: bigint('car_id', { mode: 'number' })
      .references(() => cars.id)
      .notNull(),
    driverId: bigint('driver_id', { mode: 'number' })
      .references(() => drivers.id)
      .notNull(),
    startAt: timestamp('start_at').defaultNow().notNull(),
    endAt: timestamp('end_at'),
  },
  (table) => ({
    carIdx: index('idx_car_drivers_car_id').on(table.carId),
    driverIdx: index('idx_car_drivers_driver_id').on(table.driverId),
    activeIdx: index('idx_car_drivers_active').on(table.carId, table.endAt),
  }),
);

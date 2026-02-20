import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';

export const carPositions = pgTable(
  'car_positions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    carId: bigint('car_id', { mode: 'number' })
      .references(() => cars.id)
      .notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    speed: integer('speed'),
    angle: integer('angle'),
    satellites: integer('satellites'),
    ignition: boolean('ignition'),
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

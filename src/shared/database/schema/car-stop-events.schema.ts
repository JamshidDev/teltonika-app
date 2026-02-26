import {
  bigint,
  bigserial,
  doublePrecision,
  integer,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';

export const carStopEvents = pgTable('car_stop_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  carId: bigint('car_id', { mode: 'number' })
    .references(() => cars.id)
    .notNull(),
  type: varchar('type', { length: 10 }).notNull(), // 'stop' | 'parking'
  startAt: timestamp('start_at').notNull(),
  endAt: timestamp('end_at'),
  durationSeconds: integer('duration_seconds'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
});

import {
  bigint,
  bigserial,
  doublePrecision,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';

export const carEngineEvents = pgTable('car_engine_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  carId: bigint('car_id', { mode: 'number' })
    .references(() => cars.id)
    .notNull(),
  eventType: varchar('event_type', { length: 8 }).notNull(), // 'on' / 'off'
  eventAt: timestamp('event_at').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
});

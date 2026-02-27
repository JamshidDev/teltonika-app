import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  timestamp,
} from 'drizzle-orm/pg-core';
import { cars } from './cars.schema';

export const carLastPositions = pgTable(
  'car_last_positions',
  {
    carId: bigint('car_id', { mode: 'number' })
      .unique()
      .notNull()
      .references(() => cars.id),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    speed: integer('speed'),
    angle: integer('angle'),
    altitude: integer('altitude'),
    satellites: integer('satellites'),
    ignition: boolean('ignition'),
    movement: boolean('movement'),
    odometer: bigint('odometer', { mode: 'number' }),
    gsmSignal: integer('gsm_signal'),
    batteryVoltage: integer('battery_voltage'),
    extVoltage: integer('ext_voltage'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    ignitionIdx: index('idx_last_pos_ignition').on(table.ignition),
    movementIdx: index('idx_last_pos_movement').on(table.movement),
    recordedAtIdx: index('idx_last_pos_recorded_at').on(table.recordedAt),
  }),
);

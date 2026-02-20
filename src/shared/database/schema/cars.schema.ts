import {
  bigint,
  bigserial,
  index,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const cars = pgTable(
  'cars',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: bigint('user_id', { mode: 'number' })
      .references(() => users.id)
      .notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    deviceImei: varchar('device_imei', { length: 20 }).unique().notNull(),
    deviceModel: varchar('device_model', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    imeiIdx: index('idx_cars_device_imei').on(table.deviceImei),
  }),
);

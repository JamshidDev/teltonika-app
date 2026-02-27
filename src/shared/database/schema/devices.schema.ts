// src/shared/database/schema/devices.schema.ts
import {
  bigserial,
  index,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const devices = pgTable(
  'devices',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    imei: varchar('imei', { length: 20 }).unique().notNull(),
    model: varchar('model', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    imeiIdx: index('idx_devices_imei').on(table.imei),
    deletedAtIdx: index('idx_devices_deleted_at').on(table.deletedAt),
  }),
);
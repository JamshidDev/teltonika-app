import {
  bigserial,
  index,
  pgTable,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const drivers = pgTable(
  'drivers',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    fullName: varchar('full_name', { length: 100 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    licenseNumber: varchar('license_number', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    phoneIdx: index('idx_drivers_phone').on(table.phone),
    licenseIdx: index('idx_drivers_license').on(table.licenseNumber),
    deletedAtIdx: index('idx_drivers_deleted_at').on(table.deletedAt),
  }),
);

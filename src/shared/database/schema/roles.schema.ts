import {
  bigserial,
  boolean,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: varchar('name', { length: 50 }).unique().notNull(),
  // Permission kalitlari massivi: ['vehicles:read', ...]. SuperAdmin uchun ['*'].
  permissions: text('permissions').array().notNull().default([]),
  // Tizim roli — o'chirib bo'lmaydi.
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

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
    carNumber: varchar('car_number', { length: 20 }).unique(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    deletedAtIdx: index('idx_cars_deleted_at').on(table.deletedAt),
  }),
);

// src/shared/database/drizzle.provider.ts
import { Pool } from 'pg';
import { DbConfig } from '../config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Inject } from '@nestjs/common';
import * as schema from './schema';
import { relations } from './relations';

export const DRIZZLE = Symbol('DRIZZLE');

export const createDrizzleDb = (config: DbConfig) => {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    options: '-c timezone=UTC',
  });
  return drizzle(pool, {
    schema,
    relations,
    logger: true,
  });
};

export type DataSource = ReturnType<typeof createDrizzleDb>;

export const InjectDb = () => Inject(DRIZZLE);
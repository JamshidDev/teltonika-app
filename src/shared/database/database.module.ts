// src/shared/database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { createDrizzleDb, DRIZZLE } from './database.provider';
import { DbConfig } from '@config/index';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [DbConfig],
      useFactory: createDrizzleDb,
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}

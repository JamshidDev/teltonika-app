import { Module } from '@nestjs/common';
import { TeltonikaModule } from './teltonika/teltonika.module';
import { DatabaseModule } from '@/shared/database/database.module';
import { ConfigModule } from '@config/config.module';
import { CarModule } from '@/apps/backend/modules/cars/car.module';
import { AuthModule } from '@/apps/backend/modules/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { GlobalJwtGuard } from '@/shared/guards/global-jwt.guard';
import { JwtGuard } from '@/shared/guards/jwt.guard';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { RedisConfig } from '@config/redis.config';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import { GatewayModule } from '@/shared/gateway/gateway.module';

@Module({
  imports: [
    ConfigModule,
    TeltonikaModule,
    DatabaseModule,
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [RedisConfig],
      useFactory: (config: RedisConfig) => {
        const redisUrl = `redis://${config.host}:${config.port}`;
        return {
          stores: [new KeyvRedis(redisUrl), new Keyv()],
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [RedisConfig],
      useFactory: (config: RedisConfig) => ({
        connection: {
          host: config.host,
          port: config.port,
        },
      }),
    }),
    AuthModule,
    CarModule,
    GatewayModule,
  ],
  controllers: [],
  providers: [
    JwtGuard,
    {
      provide: APP_GUARD,
      useClass: GlobalJwtGuard,
    },
  ],
})
export class AppModule {}

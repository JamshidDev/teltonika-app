import { Module } from '@nestjs/common';
import { TeltonikaModule } from './teltonika/teltonika.module';
import { DatabaseModule } from '@/shared/database/database.module';
import { ConfigModule } from '@config/config.module';
import { CarModule } from '@/apps/backend/modules/cars/car.module';

@Module({
  imports: [ConfigModule, TeltonikaModule, DatabaseModule, CarModule],
  controllers: [],
  providers: [],
})
export class AppModule {}

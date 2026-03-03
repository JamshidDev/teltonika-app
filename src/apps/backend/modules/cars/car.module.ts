// src/cars/cars.module.ts
import { Module } from '@nestjs/common';
import { CarService } from './car.service';
import { CarController } from './car.controller';
import { TeltonikaModule } from '@/teltonika/teltonika.module';

@Module({
  imports: [TeltonikaModule],
  providers: [CarService],
  controllers: [CarController],
})
export class CarModule {}

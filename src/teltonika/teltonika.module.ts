import { Module } from '@nestjs/common';
import { TeltonikaService } from './teltonika.service';
import { Codec8Parser } from './codec8.parser';
import { PositionService } from './position.service';

@Module({
  providers: [TeltonikaService, Codec8Parser, PositionService],
})
export class TeltonikaModule {}

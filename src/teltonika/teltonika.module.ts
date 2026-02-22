import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TeltonikaService } from './teltonika.service';
import { Codec8Parser } from './codec8.parser';
import { PositionService } from './position.service';
import { PositionProcessor } from './position.processor';
import { POSITION_QUEUE } from './position.job';
import { GatewayModule } from '@/shared/gateway/gateway.module';

@Module({
  imports: [BullModule.registerQueue({ name: POSITION_QUEUE }), GatewayModule],
  providers: [
    TeltonikaService,
    Codec8Parser,
    PositionService,
    PositionProcessor,
  ],
})
export class TeltonikaModule {}

import { Module } from '@nestjs/common';
import { EngineEventsController } from './engine-events.controller';
import { EngineEventsService } from './engine-events.service';

@Module({
  controllers: [EngineEventsController],
  providers: [EngineEventsService],
  exports: [EngineEventsService],
})
export class EngineEventsModule {}
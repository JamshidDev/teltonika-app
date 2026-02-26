import { Module } from '@nestjs/common';
import { StopEventsController } from './stop-events.controller';
import { StopEventsService } from './stop-events.service';

@Module({
  controllers: [StopEventsController],
  providers: [StopEventsService],
  exports: [StopEventsService],
})
export class StopEventsModule {}
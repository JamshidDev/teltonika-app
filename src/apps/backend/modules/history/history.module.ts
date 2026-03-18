import { Module } from '@nestjs/common';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { RouteConfig } from '@/shared/config/route.config';

@Module({
  controllers: [HistoryController],
  providers: [HistoryService, RouteConfig],
})
export class HistoryModule {}

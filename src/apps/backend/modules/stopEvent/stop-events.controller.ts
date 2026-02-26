import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StopEventsService } from './stop-events.service';
import { StopEventsQueryDto } from './stop-events.dto';

@ApiBearerAuth()
@ApiTags('Stop Events')
@Controller('api/stop-events')
export class StopEventsController {
  constructor(private readonly stopEventsService: StopEventsService) {}

  @Get()
  findAll(@Query() dto: StopEventsQueryDto) {
    return this.stopEventsService.findAll(dto);
  }
}

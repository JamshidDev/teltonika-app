import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from '@/shared/decarators/get-user.decorator';
import { EngineEventsService } from './engine-events.service';
import { EngineEventsQueryDto } from './engine-events.dto';

@ApiBearerAuth()
@ApiTags('Engine Events')
@Controller('api/engine-events')
export class EngineEventsController {
  constructor(private readonly engineEventsService: EngineEventsService) {}

  @Get()
  findAll(@Query() dto: EngineEventsQueryDto, @GetUser('id') userId: number) {
    return this.engineEventsService.findAll(dto, userId);
  }
}
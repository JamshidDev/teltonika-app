import { Controller, Get, Query } from '@nestjs/common';
import { HistoryService } from './history.service';
import {
  CarHistoryDto,
  CarRouteDto,
  CarRouteWithEventsDto,
} from './history.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetUser } from '@/shared/decarators/get-user.decorator';
import { RequirePermission } from '@/shared/decarators/require-permission.decorator';

@ApiBearerAuth()
@ApiTags('History')
@Controller('api/history')
@RequirePermission('history:read')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('positions')
  getCarPositions(@Query() dto: CarHistoryDto, @GetUser('id') userId: number) {
    return this.historyService.getCarPositions(dto, userId);
  }

  @Get('route')
  getCarRoute(@Query() dto: CarRouteDto, @GetUser('id') userId: number) {
    return this.historyService.getCarRoute(dto, userId);
  }

  @Get('route-with-events')
  async getRouteWithEvents(
    @Query() dto: CarRouteWithEventsDto,
    @GetUser('id') userId: number,
  ) {
    return this.historyService.getPositionTimeline(
      dto.carId,
      userId,
      dto.from,
      dto.to,
    );
  }

  @ApiOperation({ summary: 'Raw positions grouped by hour (24h)' })
  @Get('raw-positions')
  async getRawPositions(
    @Query() dto: CarRouteWithEventsDto,
    @GetUser('id') userId: number,
  ) {
    return this.historyService.getRawPositions(
      dto.carId,
      userId,
      dto.from,
      dto.to,
      dto.tzOffset,
    );
  }

  /** Diagnostika: qaysi filter qancha nuqtani yo'q qilayotganini ko'rsatadi */
  @Get('diagnose-filters')
  async diagnoseFilters(
    @Query() dto: CarRouteWithEventsDto,
    @GetUser('id') userId: number,
  ) {
    return this.historyService.diagnosRouteFilters(
      dto.carId,
      userId,
      dto.from,
      dto.to,
    );
  }

  @ApiOperation({ summary: 'Timeline from raw positions (no event table)' })
  @Get('position-timeline')
  async getPositionTimeline(
    @Query() dto: CarRouteWithEventsDto,
    @GetUser('id') userId: number,
  ) {
    return this.historyService.getPositionTimeline(
      dto.carId,
      userId,
      dto.from,
      dto.to,
    );
  }

  @ApiOperation({
    summary: 'Device traffic stats — car, device, driver, total bytes',
  })
  @Get('traffic')
  async getTrafficStats(
    @Query() dto: CarRouteWithEventsDto,
    @GetUser('id') userId: number,
  ) {
    return this.historyService.getTrafficStats(
      dto.carId,
      userId,
      dto.from,
      dto.to,
    );
  }

  @Get('route/geojson')
  async getCarRouteGeoJson(
    @Query() dto: CarRouteDto,
    @GetUser('id') userId: number,
  ) {
    const data = await this.historyService.getCarRoute(dto, userId);

    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: data.map((p) => [p.lng, p.lat]),
      },
      properties: {
        carId: dto.carId,
        from: dto.from,
        to: dto.to,
        totalPoints: data.length,
      },
    };
  }
}

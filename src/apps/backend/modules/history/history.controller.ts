import { Controller, Get, Query } from '@nestjs/common';
import { HistoryService } from './history.service';
import {
  CarHistoryDto,
  CarRouteDto,
  CarRouteWithEventsDto,
} from './history.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/shared/decarators/public.decorator';

@ApiBearerAuth()
@ApiTags('History')
@Controller('api/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('positions')
  getCarPositions(@Query() dto: CarHistoryDto) {
    return this.historyService.getCarPositions(dto);
  }

  @Get('route')
  getCarRoute(@Query() dto: CarRouteDto) {
    return this.historyService.getCarRoute(dto);
  }

  @Public()
  @Get('route-with-events')
  async getRouteWithEvents(@Query() dto: CarRouteWithEventsDto) {
    return this.historyService.getCarRouteWithEvents(
      dto.carId,
      dto.from,
      dto.to,
    );
  }

  @Get('raw-positions')
  async getRawPositions(@Query() dto: CarRouteWithEventsDto) {
    return this.historyService.getRawPositions(dto.carId, dto.from, dto.to);
  }

  /** Diagnostika: qaysi filter qancha nuqtani yo'q qilayotganini ko'rsatadi */
  @Public()
  @Get('diagnose-filters')
  async diagnoseFilters(@Query() dto: CarRouteWithEventsDto) {
    return this.historyService.diagnosRouteFilters(
      dto.carId,
      dto.from,
      dto.to,
    );
  }

  @ApiOperation({ summary: 'Device traffic stats — car, device, driver, total bytes' })
  @Get('traffic')
  async getTrafficStats(@Query() dto: CarRouteWithEventsDto) {
    return this.historyService.getTrafficStats(dto.carId, dto.from, dto.to);
  }

  @Get('route/geojson')
  async getCarRouteGeoJson(@Query() dto: CarRouteDto) {
    const data = await this.historyService.getCarRoute(dto);

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

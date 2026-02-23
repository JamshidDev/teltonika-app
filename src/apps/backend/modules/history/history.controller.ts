import { Controller, Get, Query } from '@nestjs/common';
import { HistoryService } from './history.service';
import { CarHistoryDto, CarRouteDto } from './history.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

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

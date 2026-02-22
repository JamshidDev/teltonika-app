// src/cars/cars.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CarService } from './car.service';
import { ApiPaginatedResponse } from '@/shared/decarators/api-paginated-response';
import {
  CarResponseDto,
  CreateCarDto,
} from '@/apps/backend/modules/cars/car.dto';
import { PaginationDto } from '@/shared/dto/common.dto';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

@ApiBearerAuth()
@ApiTags('Cars')
@Controller('api/car')
export class CarController {
  constructor(private readonly carService: CarService) {}

  @Get()
  @ApiPaginatedResponse(CarResponseDto)
  findAll(@Query() query: PaginationDto) {
    return this.carService.findAll(query);
  }

  @Get('last-positions')
  @ApiPaginatedResponse(CarResponseDto)
  getLive(@Query() query: PaginationDto) {
    return this.carService.getLastPositions(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.carService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: CarResponseDto })
  create(@Body() dto: CreateCarDto) {
    return this.carService.create(dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.carService.remove(id);
  }
}

// src/cars/cars.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CarService } from './car.service';
import { ApiPaginatedResponse } from '@/shared/decarators/api-paginated-response';
import {
  CarResponseDto,
  CreateCarDto,
  UpdateCarDto,
} from '@/apps/backend/modules/cars/car.dto';
import { PaginationDto } from '@/shared/dto/common.dto';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '@/shared/decarators/get-user.decorator';

@ApiBearerAuth()
@ApiTags('Cars')
@Controller('api/car')
export class CarController {
  constructor(private readonly carService: CarService) {}

  @Get()
  @ApiPaginatedResponse(CarResponseDto)
  findAll(@Query() query: PaginationDto, @GetUser('id') userId: number) {
    return this.carService.findAll(query, userId);
  }

  @Get('last-positions')
  @ApiPaginatedResponse(CarResponseDto)
  getLive(@Query() query: PaginationDto, @GetUser('id') userId: number) {
    return this.carService.getLastPositions(query, userId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ) {
    return this.carService.findOne(id, userId);
  }

  @Post()
  @ApiCreatedResponse({ type: CarResponseDto })
  create(@Body() dto: CreateCarDto, @GetUser('id') userId: number) {
    return this.carService.create(dto, userId);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCarDto,
    @GetUser('id') userId: number,
  ) {
    return this.carService.update(id, dto, userId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ) {
    return this.carService.remove(id, userId);
  }
}

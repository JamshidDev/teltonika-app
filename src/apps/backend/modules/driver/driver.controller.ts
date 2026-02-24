// driver.controller.ts
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
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { DriverService } from './driver.service';
import {
  CreateDriverDto,
  DriverResponseDto,
  UpdateDriverDto,
} from './driver.dto';
import { PaginationDto } from '@/shared/dto/common.dto';
import { ApiPaginatedResponse } from '@/shared/decarators/api-paginated-response';

@ApiBearerAuth()
@ApiTags('Drivers')
@Controller('api/driver')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get()
  @ApiPaginatedResponse(DriverResponseDto)
  findAll(@Query() query: PaginationDto) {
    return this.driverService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.driverService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: DriverResponseDto })
  create(@Body() dto: CreateDriverDto) {
    return this.driverService.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDriverDto) {
    return this.driverService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.driverService.remove(id);
  }
}

// device.controller.ts
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
import { DeviceService } from './device.service';
import {
  CreateDeviceDto,
  DeviceResponseDto,
  UpdateDeviceDto,
} from './device.dto';
import { PaginationDto } from '@/shared/dto/common.dto';
import { ApiPaginatedResponse } from '@/shared/decarators/api-paginated-response';

@ApiBearerAuth()
@ApiTags('Devices')
@Controller('api/device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get()
  @ApiPaginatedResponse(DeviceResponseDto)
  findAll(@Query() query: PaginationDto) {
    return this.deviceService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.deviceService.findOne(id);
  }

  @Post()
  @ApiCreatedResponse({ type: DeviceResponseDto })
  create(@Body() dto: CreateDeviceDto) {
    return this.deviceService.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeviceDto) {
    return this.deviceService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.deviceService.remove(id);
  }
}

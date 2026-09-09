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
import { RequirePermission } from '@/shared/decarators/require-permission.decorator';

@ApiBearerAuth()
@ApiTags('Devices')
@Controller('api/device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get()
  @RequirePermission('devices:read')
  @ApiPaginatedResponse(DeviceResponseDto)
  findAll(@Query() query: PaginationDto) {
    return this.deviceService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('devices:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.deviceService.findOne(id);
  }

  @Post()
  @RequirePermission('devices:edit')
  @ApiCreatedResponse({ type: DeviceResponseDto })
  create(@Body() dto: CreateDeviceDto) {
    return this.deviceService.create(dto);
  }

  @Put(':id')
  @RequirePermission('devices:edit')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeviceDto) {
    return this.deviceService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('devices:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.deviceService.remove(id);
  }
}

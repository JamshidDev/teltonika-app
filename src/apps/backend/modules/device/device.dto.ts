// device.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeviceDto {
  @ApiProperty({ example: '352094087318660' })
  @IsString()
  @MaxLength(20)
  imei: string;

  @ApiPropertyOptional({ example: 'FMB120' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  model?: string;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional({ example: '352094087318660' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  imei?: string;

  @ApiPropertyOptional({ example: 'FMB120' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  model?: string;
}

export class DeviceResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: '352094087318660' })
  imei: string;

  @ApiPropertyOptional({ example: 'FMB120' })
  model: string | null;

  @ApiProperty({ example: '2026-02-18T14:07:52.846Z' })
  createdAt: Date;
}

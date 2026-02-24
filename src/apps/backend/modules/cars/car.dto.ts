import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCarDto {

  @ApiProperty({ example: 'Damas' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: '01A123BC' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  carNumber?: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Type(() => Number)
  deviceId: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  driverId?: number;
}

export class UpdateCarDto {
  @ApiPropertyOptional({ example: 'Damas' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '01A123BC' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  carNumber?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  deviceId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  driverId?: number;
}

export class CarResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'Damas' })
  name: string;

  @ApiPropertyOptional({ example: '01A123BC' })
  carNumber: string | null;

  @ApiPropertyOptional({ example: 1 })
  deviceId: number | null;

  @ApiPropertyOptional({ example: 1 })
  driverId: number | null;

  @ApiProperty({ example: '2026-02-18T14:07:52.846Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: '2026-02-18T14:07:52.846Z' })
  updatedAt: Date | null;
}

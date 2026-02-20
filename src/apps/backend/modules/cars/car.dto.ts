import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetPositionsDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export class CreateCarDto {
  @IsNumber()
  userId: number;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(20)
  deviceImei: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  deviceModel?: string;
}

export class UpdateCarDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  deviceImei?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  deviceModel?: string;
}

export class CarResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 1 })
  userId: number;

  @ApiProperty({ example: 'Nexia' })
  name: string;

  @ApiProperty({ example: '352093089612345' })
  deviceImei: string;

  @ApiPropertyOptional({ example: 'FMB120' })
  deviceModel: string | null;

  @ApiProperty({ example: '2026-02-18T14:07:52.846Z' })
  createdAt: Date;
}

import { PaginationDto } from '@/shared/dto/common.dto';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CarHistoryDto extends PaginationDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  carId?: number;
}

export class CarRouteDto {
  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  carId: number;

  @ApiProperty({ example: '2026-02-22T00:00:00Z' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-02-22T23:59:59Z' })
  @IsDateString()
  to: string;
}

export class CarRouteWithEventsDto {
  @Type(() => Number)
  @IsInt()
  carId: number;

  @IsString()
  date: string; // '2026-02-27'
}

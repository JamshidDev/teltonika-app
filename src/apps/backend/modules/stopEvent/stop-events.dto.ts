import { PaginationDto } from '@/shared/dto/common.dto';
import { IsDateString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class StopEventsQueryDto extends PaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  carId?: number;

  @ApiProperty({ required: false, example: '2026-02-26' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

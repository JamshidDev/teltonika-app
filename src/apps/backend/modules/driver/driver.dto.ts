import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDriverDto {
  @ApiProperty({ example: 'Sardor Rahimov' })
  @IsString()
  @MaxLength(100)
  fullName: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'AA1234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  licenseNumber?: string;
}

export class UpdateDriverDto {
  @ApiPropertyOptional({ example: 'Sardor Rahimov' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'AA1234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  licenseNumber?: string;
}

export class DriverResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Sardor Rahimov' })
  fullName: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  phone: string | null;

  @ApiPropertyOptional({ example: 'AA1234567' })
  licenseNumber: string | null;

  @ApiProperty({ example: '2026-02-18T14:07:52.846Z' })
  createdAt: Date;
}

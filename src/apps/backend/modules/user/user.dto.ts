import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Siroj' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'siroj1234@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'User12345@' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Type(() => Number)
  roleId: number;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Siroj' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'siroj1234@gmail.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'User12345@' })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  roleId?: number;
}

export class UserResponseDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 'Siroj' })
  name: string;

  @ApiProperty({ example: 'siroj1234@gmail.com' })
  email: string;

  @ApiProperty({ example: 3 })
  roleId: number;

  @ApiProperty({ example: 'MapViewer' })
  roleName: string;

  @ApiProperty({ example: '2026-09-08T01:00:00.000Z' })
  createdAt: Date;
}

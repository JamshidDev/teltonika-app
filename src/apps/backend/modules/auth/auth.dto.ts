import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@test.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin12345' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'Admin' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'admin@test.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin12345' })
  @IsString()
  @MinLength(6)
  password: string;
}
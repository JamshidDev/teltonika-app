import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@test.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin12345' })
  @IsString()
  @MinLength(6)
  password: string;
}

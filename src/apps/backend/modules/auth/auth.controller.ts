// src/apps/backend/modules/auth/auth.controller.ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import { Public } from '@/shared/decarators/public.decorator';
import { GetUser } from '@/shared/decarators/get-user.decorator';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@GetUser('id') userId: number) {
    return this.authService.me(userId);
  }
}

// src/apps/backend/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtConfig } from '@/shared/config/jwt.config';

@Module({
  imports: [
    // Kalit configify orqali .env dan o'qiladi — process.env oldindan yuklangan
    // bo'lishi shart emas. Kalit bo'lmasa configify ilovani ko'tarmaydi.
    JwtModule.registerAsync({
      inject: [JwtConfig],
      useFactory: (config: JwtConfig) => ({
        secret: config.secret,
        signOptions: {
          expiresIn: config.expiresIn as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}

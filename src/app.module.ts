import { Module } from '@nestjs/common';
import { TeltonikaModule } from './teltonika/teltonika.module';
import { DatabaseModule } from '@/shared/database/database.module';
import { ConfigModule } from '@config/config.module';
import { CarModule } from '@/apps/backend/modules/cars/car.module';
import { AuthModule } from '@/apps/backend/modules/auth/auth.module';
import { APP_GUARD } from '@nestjs/core';
import { GlobalJwtGuard } from '@/shared/guards/global-jwt.guard';
import { JwtGuard} from '@/shared/guards/jwt.guard';

@Module({
  imports: [
    ConfigModule,
    TeltonikaModule,
    DatabaseModule,
    AuthModule,
    CarModule,
  ],
  controllers: [],
  providers: [
    JwtGuard,
    {
      provide: APP_GUARD,
      useClass: GlobalJwtGuard,
    },
  ],
})
export class AppModule {}

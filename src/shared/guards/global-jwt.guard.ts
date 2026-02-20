// src/shared/guards/global-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtGuard } from './jwt.guard';
import { IS_PUBLIC_KEY } from '@/shared/decarators/public.decorator';

@Injectable()
export class GlobalJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtGuard: JwtGuard,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return this.jwtGuard.canActivate(context);
  }
}

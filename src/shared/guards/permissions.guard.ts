import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSION_KEY } from '@/shared/decarators/require-permission.decorator';
import { PermissionService } from '@/shared/permission/permission.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.user) {
      throw new UnauthorizedException('Token not provided');
    }

    const info = await this.permissionService.getUserPermissions(
      request.user.id,
    );
    if (!info) {
      throw new UnauthorizedException('User not found');
    }

    request.user.roleId = info.roleId;
    request.user.roleName = info.roleName;
    request.user.permissions = info.permissions;
    request.user.isSuperAdmin = info.isSuperAdmin;

    if (info.isSuperAdmin) return true;
    if (required.some((p) => info.permissions.includes(p))) return true;

    throw new ForbiddenException(`Ruxsat yo'q: ${required.join(' | ')}`);
  }
}

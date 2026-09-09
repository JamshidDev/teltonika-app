import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { roles, users } from '@/shared/database/schema';
import { PermissionService } from '@/shared/permission/permission.service';
import {
  PERMISSION_CATALOG,
  isValidPermission,
} from '@/shared/permission/permission.constants';
import { UpdateRolePermissionsDto } from './role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectDb() private db: DataSource,
    private readonly permissionService: PermissionService,
  ) {}

  // Permission ro'yxati tizim tomonidan belgilanadi — UI shu katalogdan checkbox chizadi.
  getCatalog() {
    return PERMISSION_CATALOG;
  }

  private async getOrFail(id: number) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);

    if (!role) throw new NotFoundException('Rol topilmadi');
    return role;
  }

  async findAll() {
    return this.db
      .select({
        id: roles.id,
        name: roles.name,
        permissions: roles.permissions,
        isSystem: roles.isSystem,
        userCount: sql<number>`count(${users.id})::int`,
      })
      .from(roles)
      .leftJoin(users, eq(users.roleId, roles.id))
      .groupBy(roles.id)
      .orderBy(roles.id);
  }

  async findOne(id: number) {
    return this.getOrFail(id);
  }

  async updatePermissions(id: number, dto: UpdateRolePermissionsDto) {
    const role = await this.getOrFail(id);

    // SuperAdmin ('*') qulflangan — aks holda tizimga kirish imkoni yo'qolishi mumkin.
    if (role.isSystem) {
      throw new ConflictException(
        "Tizim rolining ruxsatlarini o'zgartirib bo'lmaydi",
      );
    }

    const invalid = dto.permissions.filter((p) => !isValidPermission(p));
    if (invalid.length) {
      throw new BadRequestException(
        `Noma'lum permission: ${invalid.join(', ')}`,
      );
    }

    const [updated] = await this.db
      .update(roles)
      .set({ permissions: dto.permissions, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();

    await this.permissionService.invalidateRole(id);
    return updated;
  }
}

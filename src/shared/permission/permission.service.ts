import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { eq } from 'drizzle-orm';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { roles, users } from '@/shared/database/schema';
import { WILDCARD_PERMISSION } from './permission.constants';

export interface UserPermissions {
  roleId: number;
  roleName: string;
  permissions: string[];
  isSuperAdmin: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PermissionService {
  constructor(
    @InjectDb() private readonly db: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private key(userId: number) {
    return `perms:user:${userId}`;
  }

  async getUserPermissions(userId: number): Promise<UserPermissions | null> {
    const cached = await this.cache.get<UserPermissions>(this.key(userId));
    if (cached) return cached;

    const [row] = await this.db
      .select({
        roleId: roles.id,
        roleName: roles.name,
        permissions: roles.permissions,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) return null;

    const result: UserPermissions = {
      roleId: row.roleId,
      roleName: row.roleName,
      permissions: row.permissions ?? [],
      isSuperAdmin: (row.permissions ?? []).includes(WILDCARD_PERMISSION),
    };

    await this.cache.set(this.key(userId), result, CACHE_TTL_MS);
    return result;
  }

  async invalidateUser(userId: number): Promise<void> {
    await this.cache.del(this.key(userId));
  }

  // Rol tahrirlanganda shu roldagi barcha userlar keshini tozalaydi.
  async invalidateRole(roleId: number): Promise<void> {
    const affected = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.roleId, roleId));

    await Promise.all(affected.map((u) => this.invalidateUser(u.id)));
  }
}

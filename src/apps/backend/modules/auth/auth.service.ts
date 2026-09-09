// src/apps/backend/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { roles, users } from '@/shared/database/schema';
import { PermissionService } from '@/shared/permission/permission.service';
import { LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private db: DataSource,
    private readonly jwt: JwtService,
    private readonly permissionService: PermissionService,
  ) {}

  async login(dto: LoginDto) {
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        password: users.password,
        roleId: roles.id,
        roleName: roles.name,
        permissions: roles.permissions,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.email, dto.email))
      .limit(1);

    if (!row) {
      throw new UnauthorizedException('Email or password incorrect');
    }

    const valid = await bcrypt.compare(dto.password, row.password);
    if (!valid) {
      throw new UnauthorizedException('Email or password incorrect');
    }

    const token = this.jwt.sign({ id: row.id, email: row.email });

    return {
      user: this.toProfile(row),
      token,
    };
  }

  async me(userId: number) {
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: roles.id,
        roleName: roles.name,
        permissions: roles.permissions,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) throw new UnauthorizedException('User not found');
    return this.toProfile(row);
  }

  private toProfile(row: {
    id: number;
    name: string;
    email: string;
    roleId: number;
    roleName: string;
    permissions: string[] | null;
  }) {
    const permissions = row.permissions ?? [];
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: {
        id: row.roleId,
        name: row.roleName,
        permissions,
      },
      isSuperAdmin: permissions.includes('*'),
    };
  }
}

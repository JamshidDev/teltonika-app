import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { count, eq, isNull, and } from 'drizzle-orm';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { cars, roles, users } from '@/shared/database/schema';
import { PaginationDto } from '@/shared/dto/common.dto';
import { PermissionService } from '@/shared/permission/permission.service';
import { WILDCARD_PERMISSION } from '@/shared/permission/permission.constants';
import { CreateUserDto, UpdateUserDto } from './user.dto';

const USER_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  roleId: users.roleId,
  roleName: roles.name,
  createdAt: users.createdAt,
};

@Injectable()
export class UserService {
  constructor(
    @InjectDb() private db: DataSource,
    private readonly permissionService: PermissionService,
  ) {}

  private async getRoleOrFail(roleId: number) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);

    if (!role) throw new NotFoundException('Rol topilmadi');
    return role;
  }

  private async assertEmailFree(email: string, exceptId?: number) {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Email already exists');
    }
  }

  async findAll(dto: PaginationDto) {
    const page = Math.max(dto.page ?? 1, 1);
    const pageSize = Math.min(Math.max(dto.pageSize ?? 20, 1), 100);
    const offset = (page - 1) * pageSize;

    const [data, countResult] = await Promise.all([
      this.db
        .select(USER_COLUMNS)
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .orderBy(users.id)
        .offset(offset)
        .limit(pageSize),

      this.db.select({ total: count() }).from(users),
    ]);

    const total = Number(countResult[0]?.total ?? 0);
    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: number) {
    const [user] = await this.db
      .select(USER_COLUMNS)
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id))
      .limit(1);

    if (!user) throw new NotFoundException('User topilmadi');
    return user;
  }

  async create(dto: CreateUserDto) {
    await this.assertEmailFree(dto.email);
    await this.getRoleOrFail(dto.roleId);

    const hash = await bcrypt.hash(dto.password, 10);

    const [user] = await this.db
      .insert(users)
      .values({
        name: dto.name,
        email: dto.email,
        password: hash,
        roleId: dto.roleId,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        createdAt: users.createdAt,
      });

    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    const [current] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!current) throw new NotFoundException('User topilmadi');

    if (dto.email) await this.assertEmailFree(dto.email, id);
    if (dto.roleId) {
      await this.getRoleOrFail(dto.roleId);
      await this.assertNotLastSuperAdmin(current.roleId, dto.roleId);
    }

    const values: Partial<typeof users.$inferInsert> = {};
    if (dto.name !== undefined) values.name = dto.name;
    if (dto.email !== undefined) values.email = dto.email;
    if (dto.roleId !== undefined) values.roleId = dto.roleId;
    if (dto.password !== undefined) {
      values.password = await bcrypt.hash(dto.password, 10);
    }

    if (Object.keys(values).length === 0) {
      throw new BadRequestException("O'zgartirish uchun maydon berilmadi");
    }

    const [user] = await this.db
      .update(users)
      .set(values)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        roleId: users.roleId,
        createdAt: users.createdAt,
      });

    await this.permissionService.invalidateUser(id);
    return user;
  }

  async remove(id: number, currentUserId: number) {
    if (id === currentUserId) {
      throw new BadRequestException("O'zingizni o'chira olmaysiz");
    }

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) throw new NotFoundException('User topilmadi');

    const [carCount] = await this.db
      .select({ total: count() })
      .from(cars)
      .where(and(eq(cars.userId, id), isNull(cars.deletedAt)));

    if (Number(carCount?.total ?? 0) > 0) {
      throw new ConflictException(
        "Bu userga mashinalar biriktirilgan — avval ularni boshqa userga o'tkazing",
      );
    }

    await this.assertNotLastSuperAdmin(user.roleId);

    await this.db.delete(users).where(eq(users.id, id));
    await this.permissionService.invalidateUser(id);

    return { id, deleted: true };
  }

  // Oxirgi SuperAdmin roli olib qo'yilsa tizimga kirish imkoni yo'qoladi.
  private async assertNotLastSuperAdmin(
    currentRoleId: number,
    newRoleId?: number,
  ) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, currentRoleId))
      .limit(1);

    const isSuper = role?.permissions?.includes(WILDCARD_PERMISSION);
    if (!isSuper) return;
    if (newRoleId === currentRoleId) return;

    const [superCount] = await this.db
      .select({ total: count() })
      .from(users)
      .where(eq(users.roleId, currentRoleId));

    if (Number(superCount?.total ?? 0) <= 1) {
      throw new ConflictException(
        "Oxirgi SuperAdmin — rolini o'zgartirib yoki o'chirib bo'lmaydi",
      );
    }
  }
}

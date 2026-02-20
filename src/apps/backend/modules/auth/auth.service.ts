// src/apps/backend/modules/auth/auth.service.ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { DataSource } from '@/shared/database/database.provider';
import { InjectDb } from '@/shared/database/database.provider';
import { users } from '@/shared/database/schema';
import { eq } from 'drizzle-orm';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectDb() private db: DataSource,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('Email already exists');
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const result = await this.db
      .insert(users)
      .values({
        name: dto.name,
        email: dto.email,
        password: hash,
      })
      .returning({ id: users.id, name: users.name, email: users.email });

    const user = result[0];
    const token = this.jwt.sign({ id: user.id, email: user.email });

    return { user, token };
  }

  async login(dto: LoginDto) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    const user = result[0];
    if (!user) {
      throw new UnauthorizedException('Email or password incorrect');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Email or password incorrect');
    }

    const token = this.jwt.sign({ id: user.id, email: user.email });

    return {
      user: { id: user.id, name: user.name, email: user.email },
      token,
    };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role, User } from '@prisma/client';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth-guard';
import * as argon2 from 'argon2';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail({}, { message: 'Email tidak valid' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  password!: string;

  @IsEnum(Role)
  role!: Role;
}

export class ToggleUserDto {
  @IsBoolean()
  isActive!: boolean;
}

const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt,
});

@UseGuards(AuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Roles(Role.MANAGEMENT, Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Get()
  async list(
    @Query('role') role?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('paged') paged?: string,
  ) {
    const doPage = paged === '1';
    const take = Math.min(Number(limit) || 10, 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = role ? { role: role as Role, isActive: true } : undefined;
    const rows = await this.prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, isActive: true },
      orderBy: { name: 'asc' },
      skip: doPage ? skip : undefined,
      take: doPage ? take : undefined,
    });
    if (doPage) {
      const total = await this.prisma.user.count({ where });
      return { data: rows, total, page: Math.max(Number(page) || 1, 1), limit: take };
    }
    return rows;
  }

  @Roles(Role.MANAGEMENT, Role.ADMIN_TRAINING, Role.SUPER_ADMIN)
  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() me: AuthUser) {
    if (me.role === Role.SUPER_ADMIN) {
      // SUPER_ADMIN boleh membuat peran apa pun termasuk SUPER_ADMIN lain
    } else if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Hanya SUPER_ADMIN yang dapat membuat akun SUPER_ADMIN');
    } else if (
      me.role === Role.ADMIN_TRAINING &&
      ([Role.MANAGEMENT, Role.ADMIN_TRAINING] as Role[]).includes(dto.role)
    ) {
      throw new ForbiddenException('ADMIN_TRAINING tidak dapat membuat user MANAGEMENT/ADMIN_TRAINING');
    }
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new BadRequestException('Email sudah terdaftar');
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
        role: dto.role,
      },
    });
    await this.audit.log(me.sub, 'user.create', `Buat user ${user.email} (${user.role})`);
    return publicUser(user);
  }

  @Roles(Role.MANAGEMENT, Role.SUPER_ADMIN)
  @Patch(':id/status')
  async toggle(@Param('id') id: string, @Body() dto: ToggleUserDto, @CurrentUser() me: AuthUser) {
    if (id === me.sub) throw new BadRequestException('Tidak dapat menonaktifkan akun sendiri');
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new BadRequestException('User tidak ditemukan');
    if (target.role === Role.SUPER_ADMIN && me.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Hanya SUPER_ADMIN yang dapat mengubah status SUPER_ADMIN lain');
    }
    const user = await this.prisma.user.update({ where: { id }, data: { isActive: dto.isActive } });
    await this.audit.log(me.sub, 'user.toggle', `User ${user.email} active=${user.isActive}`);
    return publicUser(user);
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}

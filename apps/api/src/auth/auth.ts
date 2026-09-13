import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { createHash, randomBytes } from 'crypto';
import { Request, Response } from 'express';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService, AuditService } from '../infra.module';
import { AuthGuard, AuthUser, CurrentUser, Public } from '../common/auth-guard';

export const REFRESH_COOKIE = 'itm_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

export class LoginDto {
  @IsEmail({}, { message: 'Email tidak valid' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  password!: string;
}

const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: REFRESH_TTL_MS,
    });
  }

  private signAccess(user: User) {
    return this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role });
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Email atau password salah');
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const raw = randomBytes(48).toString('base64url');
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ipAddress: req.ip,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 255),
      },
    });
    this.setRefreshCookie(res, raw);
    await this.audit.log(user.id, 'auth.login', `Login ${user.email}`, req.ip);

    return { accessToken: await this.signAccess(user), expiresIn: 900, user: publicUser(user) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException('Refresh token tidak ditemukan');

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.hashToken(raw) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now() ||
      !session.user.isActive
    ) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      throw new UnauthorizedException('Sesi tidak valid, silakan login ulang');
    }

    // Rotasi: terbitkan token baru & revoke token lama
    const newRaw = randomBytes(48).toString('base64url');
    const newSession = await this.prisma.refreshSession.create({
      data: {
        userId: session.userId,
        tokenHash: this.hashToken(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ipAddress: req.ip,
      },
    });
    await this.prisma.refreshSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedById: newSession.id },
    });
    this.setRefreshCookie(res, newRaw);
    await this.audit.log(session.userId, 'auth.refresh', `Refresh token dirotasi`, req.ip);

    return { accessToken: await this.signAccess(session.user), expiresIn: 900 };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    if (raw) {
      await this.prisma.refreshSession
        .updateMany({
          where: { tokenHash: this.hashToken(raw), revokedAt: null },
          data: { revokedAt: new Date() },
        })
        .catch(() => undefined);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const full = await this.prisma.user.findUnique({
      where: { id: user.sub, isActive: true },
    });
    if (!full) throw new UnauthorizedException('Akun tidak ditemukan atau nonaktif');
    return publicUser(full);
  }
}

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret-ganti-di-produksi',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [AuthController],
})
export class AuthModule {}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Role } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Access token tidak ditemukan');
    }
    try {
      req.user = await this.jwt.verifyAsync<AuthUser>(header.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('Access token tidak valid atau kedaluwarsa');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const handlerRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler()]);
    const roles =
      handlerRoles?.length
        ? handlerRoles
        : (this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getClass()]) ?? []);
    if (!roles.length) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) throw new UnauthorizedException();
    // SUPER_ADMIN adalah role tertinggi: berwenang atas seluruh resource/konfigurasi
    if (req.user.role === Role.SUPER_ADMIN) return true;
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenException(`Role ${req.user.role} tidak diizinkan mengakses resource ini`);
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);

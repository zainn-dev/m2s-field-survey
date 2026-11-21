import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export const SESSION_COOKIE = 'm2s_session';
export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN'];
export const REVIEWER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

export const Roles = (...r: Role[]) => SetMetadata('roles', r);
export const Public = () => SetMetadata('public', true);

/** The authenticated principal attached to every request by AuthGuard. */
export interface AuthUser {
  sub: string;
  role: Role;
  name: string;
  clusterIds: string[];
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const isAdmin = (u: { role: Role }) => ADMIN_ROLES.includes(u.role);

/**
 * Global guard: every route needs a valid cookie JWT unless @Public(); @Roles() is enforced server-side.
 * The user row is re-read on each request so disabling an account or changing a password (tokenVersion bump)
 * revokes existing sessions immediately.
 */
function extractSessionToken(req: any): string | undefined {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken) return cookieToken;
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) {
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (token) return token;
  }
  return undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private ref: Reflector, private db: PrismaService) {}

  async canActivate(ctx: ExecutionContext) {
    const h = [ctx.getHandler(), ctx.getClass()];
    if (this.ref.getAllAndOverride('public', h)) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException({ code: 'NO_SESSION', message: 'Please sign in.' });
    let payload: { sub: string; tv: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired. Please sign in again.' });
    }
    const user = await this.db.user.findUnique({
      where: { id: payload.sub },
      include: { assignments: { select: { clusterId: true } } },
    });
    if (!user || !user.active || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session is no longer valid.' });
    }
    req.user = {
      sub: user.id,
      role: user.role,
      name: user.name,
      clusterIds: user.assignments.map((a) => a.clusterId),
    } satisfies AuthUser;

    // Cheap presence tracking (at most once every 2 minutes per user).
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 120_000) {
      this.db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
    }

    const roles: Role[] | undefined = this.ref.getAllAndOverride('roles', h);
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission for this action.' });
    }
    return true;
  }
}

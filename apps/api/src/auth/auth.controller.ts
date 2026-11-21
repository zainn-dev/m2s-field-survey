import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, Public, SESSION_COOKIE } from '../common/auth';
import { toUser, userInclude } from '../common/mappers';
import { describeGpsArea, extractClientIp, resolveIpLocation } from '../common/network';
import { passwordProblem } from '../common/validation';

class LoginDto {
  /** Email address or 10-digit mobile number */
  @IsString() @MinLength(3) @MaxLength(120) identifier: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
  /** Which console the user is signing in to; volunteers cannot use the admin console. */
  @IsOptional() @IsIn(['admin', 'volunteer']) app?: 'admin' | 'volunteer';
}
class ChangePasswordDto {
  @IsString() currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(200) newPassword: string;
}
class ReportLocationDto {
  @IsOptional() @IsNumber() @Min(-90) @Max(90) gpsLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) gpsLng?: number;
  @IsOptional() @IsNumber() @Min(0) gpsAccuracyMeters?: number;
  @IsOptional() @IsString() @MaxLength(60) gpsCapturedAt?: string;
  @IsOptional() @IsIn(['granted', 'denied', 'prompt', 'unavailable']) gpsPermissionStatus?: string;
  @IsOptional() @IsString() @MaxLength(140) locationLabel?: string;
  @IsOptional() @IsString() @MaxLength(100) clusterName?: string;
}

const SESSION_HOURS = 12;
// Constant-time-ish: compare against a dummy hash when the user does not exist.
// Same cost as real hashes so an unknown e-mail takes as long as a wrong password (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

function sessionCookieSecure(): boolean {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: sessionCookieSecure(),
    maxAge: SESSION_HOURS * 3600e3,
    path: '/',
  });
}

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private db: PrismaService, private jwt: JwtService, private audit: AuditService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() d: LoginDto, @Res({ passthrough: true }) res: Response, @Req() req: Request) {
    const id = d.identifier.trim().toLowerCase();
    const mobile = id.replace(/[\s+-]/g, '').replace(/^91(?=\d{10}$)/, '');
    const u = await this.db.user.findFirst({
      where: id.includes('@') ? { email: id } : { mobile },
      include: userInclude,
    });
    const ok = (await bcrypt.compare(d.password, u?.passwordHash ?? DUMMY_HASH)) && !!u && u.active;
    const ip = extractClientIp(req);
    if (!ok || !u) {
      await this.audit.log({
        actorId: u?.id,
        action: 'login_failed',
        entity: 'user',
        entityId: u?.id,
        summary: `Failed sign-in attempt${u ? ` for ${u.name}` : ''}`,
        ip,
      });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email/mobile or password.' });
    }
    if (d.app === 'admin' && u.role === 'VOLUNTEER') {
      throw new UnauthorizedException({ code: 'WRONG_CONSOLE', message: 'Volunteers sign in through the field app.' });
    }
    const ipLocation = await resolveIpLocation(ip, req);
    const token = await this.jwt.signAsync({ sub: u.id, tv: u.tokenVersion }, { expiresIn: `${SESSION_HOURS}h` });
    setSessionCookie(res, token);
    const updatedUser = await this.db.user.update({
      where: { id: u.id },
      data: {
        lastActiveAt: new Date(),
        ...(ip ? { lastIp: ip } : {}),
        ...(ipLocation ? { lastIpLocation: ipLocation } : {}),
      },
      include: userInclude,
    });
    await this.audit.log({
      actorId: u.id,
      action: 'login',
      entity: 'user',
      entityId: u.id,
      summary: `${u.name} signed in${d.app === 'volunteer' ? ' to the field app' : d.app === 'admin' ? ' to the admin console' : ''}${ipLocation ? ` (${ipLocation})` : ''}`,
      ip,
    });
    const isNativeCapacitor = req.header('x-client-platform') === 'capacitor' && d.app === 'volunteer';
    return isNativeCapacitor ? { ...toUser(updatedUser, true), token } : toUser(updatedUser, true);
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/', sameSite: 'strict', secure: sessionCookieSecure() });
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() me: AuthUser) {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: me.sub }, include: userInclude });
    return toUser(u, true);
  }

  /** Automatically records the signed-in volunteer's/user's live IP, IP area, and GPS fix for the Admin Dashboard. */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('location')
  @HttpCode(200)
  async reportLocation(@Body() d: ReportLocationDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const ip = extractClientIp(req);
    const ipLocation = await resolveIpLocation(ip, req);
    const hasCoords = Number.isFinite(d.gpsLat) && Number.isFinite(d.gpsLng);
    const parsedCaptured = d.gpsCapturedAt ? new Date(d.gpsCapturedAt) : null;
    const gpsCapturedAt = parsedCaptured && !Number.isNaN(parsedCaptured.getTime()) ? parsedCaptured : new Date();
    const label =
      d.locationLabel?.trim() ||
      d.clusterName?.trim() ||
      (hasCoords ? describeGpsArea(d.gpsLat, d.gpsLng) : undefined) ||
      ipLocation;

    const updated = await this.db.user.update({
      where: { id: me.sub },
      data: {
        lastActiveAt: new Date(),
        ...(ip ? { lastIp: ip } : {}),
        ...(ipLocation ? { lastIpLocation: ipLocation } : {}),
        ...(hasCoords
          ? {
              lastGpsLat: d.gpsLat,
              lastGpsLng: d.gpsLng,
              lastGpsAccuracy: Number.isFinite(d.gpsAccuracyMeters) ? Math.min(d.gpsAccuracyMeters!, 10_000_000) : undefined,
              lastGpsCapturedAt: gpsCapturedAt,
            }
          : {}),
        ...(label ? { lastLocationLabel: label } : {}),
      },
      include: userInclude,
    });

    return {
      ok: true,
      ip: updated.lastIp ?? ip,
      ipLocation: updated.lastIpLocation ?? ipLocation,
      lastGpsLat: updated.lastGpsLat ?? undefined,
      lastGpsLng: updated.lastGpsLng ?? undefined,
      lastGpsAccuracy: updated.lastGpsAccuracy ?? undefined,
      lastGpsCapturedAt: updated.lastGpsCapturedAt?.toISOString(),
      lastLocationLabel: updated.lastLocationLabel ?? undefined,
      lastActive: updated.lastActiveAt?.toISOString(),
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Body() d: ChangePasswordDto,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: me.sub } });
    if (!(await bcrypt.compare(d.currentPassword, u.passwordHash))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'Current password is incorrect.' });
    }
    const problem = passwordProblem(d.newPassword);
    if (problem) throw new BadRequestException({ code: 'WEAK_PASSWORD', message: problem });
    const updated = await this.db.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(d.newPassword, 12), tokenVersion: { increment: 1 } },
    });
    // Re-issue this session; all other sessions are revoked by the tokenVersion bump.
    const token = await this.jwt.signAsync({ sub: u.id, tv: updated.tokenVersion }, { expiresIn: `${SESSION_HOURS}h` });
    setSessionCookie(res, token);
    await this.audit.log({ actorId: u.id, action: 'password_change', entity: 'user', entityId: u.id, summary: `${u.name} changed their password` });
    return req.header('x-client-platform') === 'capacitor' ? { ok: true, token } : { ok: true };
  }
}

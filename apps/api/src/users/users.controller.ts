import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import bcrypt from 'bcryptjs';
import type { Prisma, Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { ADMIN_ROLES, AuthUser, CurrentUser, isAdmin, REVIEWER_ROLES, Roles } from '../common/auth';
import { toUser, userInclude } from '../common/mappers';
import { extractClientIp } from '../common/network';
import { passwordProblem } from '../common/validation';

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'VOLUNTEER'];

class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() @MaxLength(120) email: string;
  @IsOptional() @Matches(/^$|^[6-9]\d{9}$/, { message: 'Mobile must be a 10-digit Indian number' }) mobile?: string;
  @IsIn(ROLES) role: Role;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) assignedClusterIds: string[];
  @IsOptional() @IsInt() @Min(0) @Max(10000) targetHouseholds?: number;
  @IsString() @MinLength(10) @MaxLength(200) password: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsEmail() @MaxLength(120) email?: string;
  @IsOptional() @Matches(/^$|^[6-9]\d{9}$/, { message: 'Mobile must be a 10-digit Indian number' }) mobile?: string;
  @IsOptional() @IsIn(ROLES) role?: Role;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) assignedClusterIds?: string[];
  @IsOptional() @IsInt() @Min(0) @Max(10000) targetHouseholds?: number | null;
}
class ActiveDto {
  @IsBoolean() active: boolean;
}
class ResetPasswordDto {
  @IsString() @MinLength(10) @MaxLength(200) password: string;
}

const rank = (r: Role) => ROLES.length - ROLES.indexOf(r); // SUPER_ADMIN highest

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private db: PrismaService, private audit: AuditService) {}

  /** Admins see everyone; supervisors see volunteers in their clusters; volunteers see themselves. */
  @Get()
  async list(@CurrentUser() me: AuthUser) {
    const where: Prisma.UserWhereInput = isAdmin(me)
      ? {}
      : me.role === 'SUPERVISOR'
        ? { OR: [{ id: me.sub }, { role: 'VOLUNTEER', assignments: { some: { clusterId: { in: me.clusterIds } } } }] }
        : { id: me.sub };
    const rows = await this.db.user.findMany({ where, include: userInclude, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
    const includeTelemetry = REVIEWER_ROLES.includes(me.role as (typeof REVIEWER_ROLES)[number]);
    return rows.map((u) => toUser(u, includeTelemetry || u.id === me.sub));
  }

  @Roles(...ADMIN_ROLES)
  @Post()
  async create(@Body() d: CreateUserDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    this.assertCanManageRole(me, d.role);
    const problem = passwordProblem(d.password);
    if (problem) throw new BadRequestException({ code: 'WEAK_PASSWORD', message: problem });
    await this.assertUnique(d.email, d.mobile);
    await this.assertClusters(d.assignedClusterIds);
    const u = await this.db.user.create({
      data: {
        name: d.name.trim(),
        email: d.email.toLowerCase().trim(),
        mobile: d.mobile || null,
        role: d.role,
        targetHouseholds: d.targetHouseholds ?? null,
        passwordHash: await bcrypt.hash(d.password, 12),
        assignments: { create: d.assignedClusterIds.map((clusterId) => ({ clusterId })) },
      },
      include: userInclude,
    });
    await this.audit.log({ actorId: me.sub, action: 'user_create', entity: 'user', entityId: u.id, summary: `${me.name} added ${u.name} (${u.role.toLowerCase()})`, ip: req.ip });
    return toUser(u);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateUserDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const u = await this.find(id);
    if (id !== me.sub) this.assertCanManageRole(me, u.role);
    if (d.role && d.role !== u.role) this.assertCanManageRole(me, d.role);
    if (id === me.sub && d.role && d.role !== u.role) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot change your own role.' });
    await this.assertUnique(d.email, d.mobile, id);
    if (d.assignedClusterIds) await this.assertClusters(d.assignedClusterIds);
    const updated = await this.db.$transaction(async (tx) => {
      if (d.assignedClusterIds) {
        await tx.clusterAssignment.deleteMany({ where: { userId: id } });
        await tx.clusterAssignment.createMany({ data: d.assignedClusterIds.map((clusterId) => ({ userId: id, clusterId })) });
      }
      return tx.user.update({
        where: { id },
        data: {
          name: d.name?.trim(),
          email: d.email?.toLowerCase().trim(),
          mobile: d.mobile === undefined ? undefined : d.mobile || null,
          role: d.role,
          targetHouseholds: d.targetHouseholds === undefined ? undefined : d.targetHouseholds,
          // A role change revokes existing sessions.
          tokenVersion: d.role && d.role !== u.role ? { increment: 1 } : undefined,
        },
        include: userInclude,
      });
    });
    await this.audit.log({ actorId: me.sub, action: 'user_update', entity: 'user', entityId: id, summary: `${me.name} updated ${updated.name}`, ip: req.ip });
    return toUser(updated);
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/active')
  @HttpCode(200)
  async setActive(@Param('id', ParseUUIDPipe) id: string, @Body() d: ActiveDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const u = await this.find(id);
    this.assertCanManageRole(me, u.role);
    if (id === me.sub) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot deactivate your own account.' });
    const updated = await this.db.user.update({
      where: { id },
      data: { active: d.active, tokenVersion: d.active ? undefined : { increment: 1 } },
      include: userInclude,
    });
    await this.audit.log({
      actorId: me.sub,
      action: d.active ? 'user_activate' : 'user_deactivate',
      entity: 'user',
      entityId: id,
      summary: `${me.name} ${d.active ? 'reactivated' : 'deactivated'} ${u.name}`,
      ip: req.ip,
    });
    return toUser(updated);
  }

  @Roles(...ADMIN_ROLES)
  @Post(':id/reset-password')
  @HttpCode(200)
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() d: ResetPasswordDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const u = await this.find(id);
    this.assertCanManageRole(me, u.role);
    const problem = passwordProblem(d.password);
    if (problem) throw new BadRequestException({ code: 'WEAK_PASSWORD', message: problem });
    await this.db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(d.password, 12), tokenVersion: { increment: 1 } } });
    await this.audit.log({ actorId: me.sub, action: 'password_reset', entity: 'user', entityId: id, summary: `${me.name} reset the password for ${u.name}`, ip: req.ip });
    return { ok: true };
  }

  private async find(id: string) {
    const u = await this.db.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return u;
  }

  /** Only a SUPER_ADMIN can create or manage admins; nobody can manage a higher role than their own. */
  private assertCanManageRole(me: AuthUser, target: Role) {
    if (rank(target) > rank(me.role) || (target === 'ADMIN' && me.role !== 'SUPER_ADMIN') || (target === 'SUPER_ADMIN' && me.role !== 'SUPER_ADMIN')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only a super admin can manage admin accounts.' });
    }
  }

  private async assertUnique(email?: string, mobile?: string, exceptId?: string) {
    if (email) {
      const e = await this.db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (e && e.id !== exceptId) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Another account already uses this email.' });
    }
    if (mobile) {
      const m = await this.db.user.findUnique({ where: { mobile } });
      if (m && m.id !== exceptId) throw new ConflictException({ code: 'MOBILE_TAKEN', message: 'Another account already uses this mobile number.' });
    }
  }

  private async assertClusters(ids: string[]) {
    if (!ids.length) return;
    const n = await this.db.cluster.count({ where: { id: { in: ids } } });
    if (n !== new Set(ids).size) throw new BadRequestException({ code: 'UNKNOWN_CLUSTER', message: 'One or more clusters do not exist.' });
  }
}

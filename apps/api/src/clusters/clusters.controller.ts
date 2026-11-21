import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { ADMIN_ROLES, AuthUser, CurrentUser, Roles } from '../common/auth';
import { toCluster } from '../common/mappers';

class CreateClusterDto {
  @IsOptional() @Matches(/^[a-z0-9-]{2,40}$/) id?: string;
  @Matches(/^[A-Z0-9-]{2,12}$/, { message: 'Code must look like CL-08' }) code: string;
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsInt() @Min(0) @Max(10000) targetHouseholds: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) mapX?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) mapY?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
class UpdateClusterDto {
  @IsOptional() @Matches(/^[A-Z0-9-]{2,12}$/) code?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) targetHouseholds?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) mapX?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) mapY?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

@Controller({ path: 'clusters', version: '1' })
export class ClustersController {
  constructor(private db: PrismaService, private audit: AuditService) {}

  @Get()
  async list() {
    return (await this.db.cluster.findMany({ orderBy: { code: 'asc' } })).map(toCluster);
  }

  @Roles(...ADMIN_ROLES)
  @Post()
  async create(@Body() d: CreateClusterDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const id = d.id || slug(d.name);
    const clash = await this.db.cluster.findFirst({ where: { OR: [{ id }, { code: d.code }, { name: d.name.trim() }] } });
    if (clash) throw new ConflictException({ code: 'CLUSTER_EXISTS', message: 'A cluster with this name or code already exists.' });
    const c = await this.db.cluster.create({
      data: { id, code: d.code, name: d.name.trim(), targetHouseholds: d.targetHouseholds, mapX: d.mapX ?? 50, mapY: d.mapY ?? 50, active: d.active ?? true },
    });
    await this.audit.log({ actorId: me.sub, action: 'cluster_create', entity: 'cluster', entityId: c.id, summary: `${me.name} added cluster ${c.name}`, ip: req.ip });
    return toCluster(c);
  }

  @Roles(...ADMIN_ROLES)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() d: UpdateClusterDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const existing = await this.db.cluster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Cluster not found' });
    if (d.code || d.name) {
      const clash = await this.db.cluster.findFirst({
        where: { id: { not: id }, OR: [...(d.code ? [{ code: d.code }] : []), ...(d.name ? [{ name: d.name.trim() }] : [])] },
      });
      if (clash) throw new ConflictException({ code: 'CLUSTER_EXISTS', message: 'Another cluster already uses this name or code.' });
    }
    const c = await this.db.cluster.update({ where: { id }, data: { ...d, name: d.name?.trim() } });
    await this.audit.log({ actorId: me.sub, action: 'cluster_update', entity: 'cluster', entityId: id, summary: `${me.name} updated cluster ${c.name}`, ip: req.ip });
    return toCluster(c);
  }
}

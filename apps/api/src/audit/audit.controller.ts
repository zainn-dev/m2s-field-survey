import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, isAdmin } from '../common/auth';
import { auditInclude, toAudit } from '../common/mappers';
import { extractClientIp } from '../common/network';
import { documentScope, surveyScope } from '../common/scope';

class ClientAuditDto {
  /** Only client-side events that the server cannot observe itself (exports built in the browser, prints). */
  @Matches(/^(export|print|view)_[a-z_]{2,40}$/) action: string;
  @Matches(/^[a-z_]{2,20}$/) entity: string;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
  @IsString() @MaxLength(300) summary: string;
}

const ADMIN_FEED = ['survey_submit', 'document_upload', 'survey_return', 'survey_reject', 'document_reject', 'survey_create', 'user_create'];
const VOLUNTEER_FEED = ['survey_approve', 'survey_return', 'survey_reject', 'document_verify', 'document_reject'];

@Controller({ version: '1' })
export class AuditController {
  constructor(private db: PrismaService, private audit: AuditService) {}

  /**
   * Admins: full trail (with IPs). Supervisors: events on surveys/documents in their clusters plus their own.
   * Volunteers: their own actions and reviews of their work.
   */
  @Get('audit')
  async list(@CurrentUser() me: AuthUser, @Query('limit') limitRaw?: string) {
    const limit = Math.min(Math.max(Number(limitRaw) || 300, 1), 2000);
    const where = isAdmin(me) ? {} : await this.scopedWhere(me);
    const rows = await this.db.auditLog.findMany({ where, include: auditInclude, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((r) => toAudit(r, isAdmin(me)));
  }

  @Post('audit')
  @HttpCode(201)
  async record(@Body() d: ClientAuditDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const row = await this.audit.log({
      actorId: me.sub,
      action: d.action,
      entity: d.entity,
      entityId: d.entityId,
      summary: d.summary,
      ip: extractClientIp(req),
    });
    return { id: row.id };
  }

  @Get('notifications')
  async notifications(@CurrentUser() me: AuthUser) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: me.sub }, select: { notificationsSeenAt: true } });
    const volunteer = me.role === 'VOLUNTEER';
    const scoped = isAdmin(me) ? {} : await this.scopedWhere(me, false);
    const rows = await this.db.auditLog.findMany({
      where: { AND: [scoped, { action: { in: volunteer ? VOLUNTEER_FEED : ADMIN_FEED } }, { NOT: { actorId: me.sub } }] },
      include: auditInclude,
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const seen = user.notificationsSeenAt?.getTime() ?? 0;
    return rows.map((r) => ({
      id: r.id,
      title: r.summary ?? r.action,
      detail: detailFor(r.action, volunteer),
      time: r.createdAt.toISOString(),
      unread: r.createdAt.getTime() > seen,
      linkTo: linkFor(r.action, r.entityId, volunteer),
    }));
  }

  @Post('notifications/read')
  @HttpCode(200)
  async markRead(@CurrentUser() me: AuthUser) {
    await this.db.user.update({ where: { id: me.sub }, data: { notificationsSeenAt: new Date() } });
    return { ok: true };
  }

  private async scopedWhere(me: AuthUser, includeOwn = true): Promise<Prisma.AuditLogWhereInput> {
    const [surveys, docs] = await Promise.all([
      this.db.survey.findMany({ where: surveyScope(me), select: { id: true } }),
      this.db.document.findMany({ where: documentScope(me), select: { id: true } }),
    ]);
    return {
      OR: [
        ...(includeOwn ? [{ actorId: me.sub }] : []),
        { entity: 'survey', entityId: { in: surveys.map((s) => s.id) } },
        { entity: 'document', entityId: { in: docs.map((d) => d.id) } },
      ],
    };
  }
}

function detailFor(action: string, volunteer: boolean) {
  switch (action) {
    case 'survey_submit': return 'Ready for supervisor review.';
    case 'document_upload': return 'New household document awaiting verification.';
    case 'survey_return': return volunteer ? 'Open the survey, fix the noted items and resubmit.' : 'Sent back to the volunteer for corrections.';
    case 'survey_reject': return 'Survey was rejected by the reviewer.';
    case 'survey_approve': return 'Survey approved and counted as completed.';
    case 'document_verify': return 'Document verified.';
    case 'document_reject': return volunteer ? 'Re-capture this document with a clearer photo.' : 'Document needs re-capture.';
    case 'survey_create': return 'A new household survey was started.';
    case 'user_create': return 'New team member added.';
    default: return '';
  }
}

function linkFor(action: string, entityId: string | null, volunteer: boolean) {
  if (volunteer) return action.startsWith('document') ? '/volunteer/documents' : entityId ? `/volunteer/surveys/${entityId}` : '/volunteer/surveys';
  if (action === 'survey_submit') return '/admin/reviews';
  if (action.startsWith('document')) return '/admin/documents';
  if (action === 'user_create') return '/admin/users';
  return entityId ? `/admin/surveys?focus=${entityId}` : '/admin/surveys';
}

import { Controller, Get } from '@nestjs/common';
import { defaultQualityService } from '@m2s/shared/validation';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, REVIEWER_ROLES } from '../common/auth';
import { documentInclude, surveyInclude, toCluster, toDocument, toSurvey } from '../common/mappers';
import { documentScope, surveyScope } from '../common/scope';
import { SettingsService } from '../settings/settings.service';
import { UsersController } from '../users/users.controller';
import { AuditController } from '../audit/audit.controller';
import { AuthController } from '../auth/auth.controller';

/**
 * One round-trip that loads everything the signed-in user is allowed to see.
 * Volumes are small (≈100 households) so the app keeps it in memory and refreshes after each mutation.
 */
@Controller({ path: 'bootstrap', version: '1' })
export class BootstrapController {
  constructor(
    private db: PrismaService,
    private settings: SettingsService,
    private users: UsersController,
    private audit: AuditController,
    private auth: AuthController
  ) {}

  @Get()
  async get(@CurrentUser() me: AuthUser) {
    const [user, users, clusters, surveys, documents, docCategories, study, qualityPolicy, auditLogs, notifications] = await Promise.all([
      this.auth.me(me),
      this.users.list(me),
      this.db.cluster.findMany({ orderBy: { code: 'asc' } }),
      this.db.survey.findMany({ where: surveyScope(me), include: surveyInclude, orderBy: { household: { code: 'desc' } } }),
      this.db.document.findMany({ where: { ...documentScope(me), status: 'AVAILABLE' }, include: documentInclude, orderBy: { createdAt: 'desc' } }),
      this.settings.docCategories(),
      this.settings.study(),
      this.settings.qualityPolicy(),
      this.audit.list(me, '300'),
      this.audit.notifications(me),
    ]);
    return {
      user,
      users,
      clusters: clusters.map(toCluster),
      surveys: surveys.map((s) => toSurvey(s, REVIEWER_ROLES.includes(me.role as (typeof REVIEWER_ROLES)[number]))),
      documents: documents.map(toDocument),
      docCategories,
      study,
      qualityPolicy,
      qualityRules: defaultQualityService.getEngine().getRuleManifest(),
      auditLogs,
      notifications,
      serverTime: new Date().toISOString(),
    };
  }
}

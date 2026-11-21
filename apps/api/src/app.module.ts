import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './common/auth';
import { AuditService } from './common/audit.service';
import { PrismaService } from './prisma.service';
import { QuestionnaireService } from './questionnaire/questionnaire.service';
import { SettingsService } from './settings/settings.service';
import { StorageService } from './documents/storage.service';
import { ScannerService } from './documents/scanner.service';
import { AuthController } from './auth/auth.controller';
import { BootstrapController } from './bootstrap/bootstrap.controller';
import { UsersController } from './users/users.controller';
import { ClustersController } from './clusters/clusters.controller';
import { SurveysController } from './surveys/surveys.controller';
import { SurveyQualityServerService } from './surveys/quality.service';
import { DocumentsController } from './documents/documents.controller';
import { SettingsController } from './settings/settings.controller';
import { AuditController } from './audit/audit.controller';
import { ExportsController } from './exports/exports.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
  ],
  controllers: [
    HealthController,
    AuthController,
    BootstrapController,
    UsersController,
    ClustersController,
    SurveysController,
    DocumentsController,
    SettingsController,
    AuditController,
    ExportsController,
  ],
  providers: [
    PrismaService,
    AuditService,
    StorageService,
    ScannerService,
    SettingsService,
    QuestionnaireService,
    SurveyQualityServerService,
    // Reused by BootstrapController to build the combined payload.
    AuthController,
    UsersController,
    AuditController,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}

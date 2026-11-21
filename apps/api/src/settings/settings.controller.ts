import { BadRequestException, Body, Controller, Get, Put, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../common/audit.service';
import { ADMIN_ROLES, AuthUser, CurrentUser, Roles } from '../common/auth';
import { SettingsService } from './settings.service';

class CategoryDto {
  @Matches(/^[a-z0-9_]{2,40}$/) id: string;
  @IsString() @MinLength(2) @MaxLength(80) label: string;
  @IsString() @MaxLength(80) labelHi: string;
  @IsOptional() @IsBoolean() requiredForSubmission?: boolean;
  @IsOptional() @IsBoolean() requiresLast4?: boolean;
  @IsBoolean() enabled: boolean;
}
class CategoriesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => CategoryDto) categories: CategoryDto[];
}
class StudyDto {
  @IsInt() @Min(1) @Max(100000) targetSample: number;
  @IsBoolean() allowVolunteerDelete: boolean;
  @IsBoolean() requireDocumentsForSubmission: boolean;
}
class QualityPolicyDto {
  @IsBoolean() blockOnErrors: boolean;
  @IsBoolean() requireWarningAcknowledgement: boolean;
  @IsBoolean() allowSupervisorOverride: boolean;
  @IsBoolean() escalateVerifiedExceptionsToSupervisor: boolean;
  @IsInt() @Min(10) @Max(3600) minDurationSec: number;
}

@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private settings: SettingsService, private audit: AuditService) {}

  @Get()
  async get() {
    return {
      docCategories: await this.settings.docCategories(),
      study: await this.settings.study(),
      qualityPolicy: await this.settings.qualityPolicy(),
    };
  }

  @Roles(...ADMIN_ROLES)
  @Put('doc-categories')
  async putCategories(@Body() d: CategoriesDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    if (new Set(d.categories.map((c) => c.id)).size !== d.categories.length) {
      throw new BadRequestException({ code: 'DUPLICATE_ID', message: 'Category ids must be unique.' });
    }
    await this.settings.set('docCategories', d.categories);
    await this.audit.log({ actorId: me.sub, action: 'settings_update', entity: 'settings', entityId: 'docCategories', summary: `${me.name} updated document categories`, ip: req.ip });
    return d.categories;
  }

  @Roles(...ADMIN_ROLES)
  @Put('study')
  async putStudy(@Body() d: StudyDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    await this.settings.set('study', d);
    await this.audit.log({ actorId: me.sub, action: 'settings_update', entity: 'settings', entityId: 'study', summary: `${me.name} updated study settings`, ip: req.ip });
    return this.settings.study();
  }

  @Roles(...ADMIN_ROLES)
  @Put('quality-policy')
  async putQualityPolicy(@Body() d: QualityPolicyDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    await this.settings.set('qualityPolicy', d);
    await this.audit.log({
      actorId: me.sub,
      action: 'settings_update',
      entity: 'settings',
      entityId: 'qualityPolicy',
      summary: `${me.name} updated survey quality validation policy`,
      ip: req.ip,
    });
    return this.settings.qualityPolicy();
  }
}

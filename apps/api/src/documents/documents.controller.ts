import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, isAdmin, REVIEWER_ROLES, Roles } from '../common/auth';
import { assertHouseholdAccess, documentScope } from '../common/scope';
import { isLast4, sniffMime } from '../common/validation';
import { documentInclude, toDocument } from '../common/mappers';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from './storage.service';
import { ScannerService } from './scanner.service';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 10;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

class UploadDto {
  @IsString() @MinLength(2) @MaxLength(40) categoryId: string;
  @IsOptional() @IsString() @MaxLength(80) docType?: string;
  @IsOptional() @IsString() aadhaarLast4?: string;
  @IsIn(['true', 'false']) consentConfirmed: string;
  /** Optional client UUID so a retried offline upload is not stored twice. */
  @IsOptional() @IsString() @MaxLength(60) clientId?: string;
}
class RejectDto {
  @IsString() @MinLength(5) @MaxLength(500) reason: string;
}

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'page';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller({ version: '1' })
export class DocumentsController {
  constructor(
    private db: PrismaService,
    private store: StorageService,
    private scanner: ScannerService,
    private audit: AuditService,
    private settings: SettingsService
  ) {}

  @Get('documents')
  async list(@CurrentUser() me: AuthUser, @Query('householdId') householdId?: string) {
    if (householdId && !UUID_RE.test(householdId)) {
      throw new BadRequestException({ code: 'INVALID_HOUSEHOLD_ID', message: 'householdId must be a valid UUID.' });
    }
    const rows = await this.db.document.findMany({
      where: { ...documentScope(me), status: 'AVAILABLE', ...(householdId ? { householdId } : {}) },
      include: documentInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDocument);
  }

  /** Multi-page upload (field "files"). Each page is magic-byte checked; only JPG / PNG / PDF are stored. */
  @Post('households/:hid/documents')
  @UseInterceptors(FilesInterceptor('files', MAX_PAGES, { limits: { fileSize: MAX_BYTES, files: MAX_PAGES } }))
  async upload(
    @Param('hid', ParseUUIDPipe) hid: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() b: UploadDto,
    @CurrentUser() me: AuthUser,
    @Req() req: Request
  ) {
    const household = await assertHouseholdAccess(this.db, me, hid);
    if (b.clientId) {
      if (!UUID_RE.test(b.clientId)) {
        throw new BadRequestException({ code: 'INVALID_CLIENT_ID', message: 'clientId must be a valid UUID.' });
      }
      const dup = await this.db.document.findUnique({ where: { id: b.clientId }, include: documentInclude });
      if (dup) {
        if (dup.householdId !== hid) throw new ConflictException({ code: 'ID_REUSED', message: 'Document id reuse' });
        return toDocument(dup);
      }
    }
    if (!files?.length) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Attach at least one page.' });
    if (b.consentConfirmed !== 'true') {
      throw new BadRequestException({ code: 'CONSENT_REQUIRED', message: 'Confirm the household consented to this document being recorded.' });
    }
    const category = (await this.settings.docCategories()).find((c) => c.id === b.categoryId && c.enabled);
    if (!category) throw new BadRequestException({ code: 'UNKNOWN_CATEGORY', message: 'Choose a valid document category.' });
    const last4 = b.aadhaarLast4?.trim() || undefined;
    if (last4 && !isLast4(last4)) {
      throw new BadRequestException({ code: 'AADHAAR_LAST4_ONLY', message: 'Enter only the last 4 digits. Full Aadhaar numbers are never stored.' });
    }
    if (category.requiresLast4 && !last4) {
      throw new BadRequestException({ code: 'LAST4_REQUIRED', message: `${category.label} requires the last 4 digits.` });
    }

    const pages = files.map((f, i) => {
      const mime = sniffMime(f.buffer);
      if (!mime) throw new BadRequestException({ code: 'UNSUPPORTED_FILE', message: `Page ${i + 1}: only JPG, PNG or PDF files are accepted.` });
      return { f, mime, i };
    });
    for (const p of pages) {
      const scan = await this.scanner.scanBuffer(p.f.buffer, p.mime);
      if (scan.status === 'INFECTED') {
        await this.audit.log({
          actorId: me.sub,
          action: 'document_quarantined',
          entity: 'household',
          entityId: hid,
          summary: `Blocked unsafe upload for ${household.code} (page ${p.i + 1}): ${scan.reason ?? 'malware signature'}`,
          ip: req.ip,
        });
        throw new UnprocessableEntityException({
          code: 'MALWARE_DETECTED',
          message: `Page ${p.i + 1} failed security scanning${scan.reason ? ` (${scan.reason})` : ''}.`,
        });
      }
      if (scan.status === 'UNAVAILABLE') {
        throw new ServiceUnavailableException({
          code: 'SCANNER_UNAVAILABLE',
          message: 'Malware scanner is temporarily unavailable. Please retry in a moment.',
        });
      }
    }
    const stored: { key: string; mime: string; f: Express.Multer.File; i: number }[] = [];
    try {
      for (const p of pages) stored.push({ ...p, key: await this.store.put(p.f.buffer, p.mime) });
    } catch (e) {
      await Promise.all(stored.map((s) => this.store.remove(s.key)));
      throw e;
    }
    let doc;
    try {
      doc = await this.db.document.create({
        data: {
          ...(b.clientId ? { id: b.clientId } : {}),
          householdId: hid,
          categoryId: category.id,
          docType: b.docType?.trim() || category.label,
          aadhaarLast4: last4,
          consentConfirmed: true,
          status: 'AVAILABLE',
          uploadedById: me.sub,
          pages: {
            create: stored.map((s) => ({
              objectKey: s.key,
              fileName: `${safeName(s.f.originalname.replace(/\.\w+$/, ''))}.${EXT[s.mime]}`,
              mime: s.mime,
              sizeBytes: s.f.size,
              sha256: createHash('sha256').update(s.f.buffer).digest('hex'),
              pageNo: s.i + 1,
            })),
          },
        },
        include: documentInclude,
      });
    } catch (e: unknown) {
      await Promise.all(stored.map((s) => this.store.remove(s.key).catch(() => undefined)));
      if (b.clientId && typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
        const dup = await this.db.document.findUnique({ where: { id: b.clientId }, include: documentInclude });
        if (dup) {
          if (dup.householdId !== hid) throw new ConflictException({ code: 'ID_REUSED', message: 'Document id reuse' });
          return toDocument(dup);
        }
      }
      throw e;
    }
    await this.audit.log({
      actorId: me.sub,
      action: 'document_upload',
      entity: 'document',
      entityId: doc.id,
      summary: `${doc.docType} (${stored.length} page${stored.length > 1 ? 's' : ''}) uploaded for ${household.code} by ${me.name}`,
      ip: req.ip,
    });
    return toDocument(doc);
  }

  /**
   * Streams one page after a permission check. Used directly as <img src> (cookie auth, same origin).
   * `?download=1` forces an attachment and is audited; `?audit=view` audits an explicit preview.
   */
  @Get('documents/:id/pages/:pageId/content')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Query('download') download: string | undefined,
    @Query('audit') auditMode: string | undefined,
    @CurrentUser() me: AuthUser,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const page = await this.db.documentPage.findFirst({
      where: { id: pageId, documentId: id, document: documentScope(me) },
      include: { document: { include: { household: true } } },
    });
    if (!page) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
    const bytes = await this.store.get(page.objectKey);
    if (download === '1' || auditMode === 'view') {
      await this.audit.log({
        actorId: me.sub,
        action: download === '1' ? 'document_download' : 'document_view',
        entity: 'document',
        entityId: id,
        summary: `${page.document.docType} (${page.document.household.code}) ${download === '1' ? 'downloaded' : 'viewed'} by ${me.name}`,
        ip: req.ip,
      });
    }
    res.setHeader('Content-Type', page.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Stored bytes are never allowed to execute script, even seeded SVG previews.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader(
      'Content-Disposition',
      `${download === '1' ? 'attachment' : 'inline'}; filename="${page.document.household.code}-${safeName(page.fileName)}"`
    );
    res.end(bytes);
  }

  @Roles(...REVIEWER_ROLES)
  @Post('documents/:id/verify')
  @HttpCode(200)
  async verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const doc = await this.findScoped(id, me);
    const updated = await this.db.document.update({
      where: { id },
      data: { verificationStatus: 'VERIFIED', rejectionReason: null, verifiedById: me.sub, verifiedAt: new Date() },
      include: documentInclude,
    });
    await this.audit.log({
      actorId: me.sub,
      action: 'document_verify',
      entity: 'document',
      entityId: id,
      summary: `${doc.docType} (${doc.household.code}) verified by ${me.name}`,
      ip: req.ip,
    });
    return toDocument(updated);
  }

  @Roles(...REVIEWER_ROLES)
  @Post('documents/:id/reject')
  @HttpCode(200)
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() d: RejectDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const doc = await this.findScoped(id, me);
    const updated = await this.db.document.update({
      where: { id },
      data: { verificationStatus: 'REJECTED', rejectionReason: d.reason.trim(), verifiedById: me.sub, verifiedAt: new Date() },
      include: documentInclude,
    });
    await this.audit.log({
      actorId: me.sub,
      action: 'document_reject',
      entity: 'document',
      entityId: id,
      summary: `${doc.docType} (${doc.household.code}) rejected by ${me.name}: ${d.reason.trim()}`,
      ip: req.ip,
    });
    return toDocument(updated);
  }

  @Delete('documents/:id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const doc = await this.findScoped(id, me);
    const own = doc.uploadedById === me.sub && doc.verificationStatus !== 'VERIFIED';
    if (!isAdmin(me) && !own) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the uploader (before verification) or an admin can delete this document.' });
    }
    if (!isAdmin(me)) {
      // Evidence behind a submitted / reviewed survey must not disappear from under the reviewer.
      const survey = await this.db.survey.findFirst({ where: { householdId: doc.householdId }, select: { status: true } });
      if (survey && survey.status !== 'DRAFT' && survey.status !== 'RETURNED') {
        throw new ConflictException({
          code: 'LOCKED',
          message: `The survey is ${survey.status.toLowerCase()}; its documents can no longer be deleted from this account.`,
        });
      }
    }
    await this.db.document.delete({ where: { id } });
    await Promise.all(doc.pages.map((p) => this.store.remove(p.objectKey)));
    await this.audit.log({
      actorId: me.sub,
      action: 'document_delete',
      entity: 'document',
      entityId: id,
      summary: `${doc.docType} (${doc.household.code}) deleted by ${me.name}`,
      ip: req.ip,
    });
    return { ok: true };
  }

  private async findScoped(id: string, me: AuthUser) {
    const doc = await this.db.document.findFirst({ where: { id, ...documentScope(me) }, include: documentInclude });
    if (!doc) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
    return doc;
  }
}

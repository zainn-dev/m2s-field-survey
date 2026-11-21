import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Module, ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { APP_GUARD, NestFactory, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthGuard } from '../src/common/auth';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/prisma.service';
import { QuestionnaireService } from '../src/questionnaire/questionnaire.service';
import { SettingsService } from '../src/settings/settings.service';
import { StorageService } from '../src/documents/storage.service';
import { ScannerService } from '../src/documents/scanner.service';
import { HealthController } from '../src/health.controller';
import { AuthController } from '../src/auth/auth.controller';
import { SurveysController } from '../src/surveys/surveys.controller';
import { SurveyQualityServerService } from '../src/surveys/quality.service';
import { SettingsController } from '../src/settings/settings.controller';
import { DocumentsController } from '../src/documents/documents.controller';
import { ExportsController } from '../src/exports/exports.controller';

process.env.JWT_SECRET = 'integration-test-jwt-secret-minimum-32-bytes!';

const QUESTIONNAIRE_DEF = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'questionnaire', 'questionnaire.v1.json'), 'utf8')
);
const Q1A = QUESTIONNAIRE_DEF.questions.find((q: any) => q.id === 'Q1a');

function defaultAnswers(overrides: Record<string, any> = {}) {
  const list: any[] = [];
  for (const q of QUESTIONNAIRE_DEF.questions) {
    if (q.id in overrides) {
      if (overrides[q.id] !== null) list.push({ questionId: q.id, ...overrides[q.id] });
      continue;
    }
    if (q.type === 'text') continue;
    if (q.type === 'date') {
      list.push({ questionId: q.id, otherText: '2025-07-12' });
      continue;
    }
    if (q.id === 'Q5') {
      list.push({ questionId: 'Q5', optionKeys: ['2'] });
      continue;
    }
    if (q.id === 'Q13' || q.id === 'Q12a' || q.id === 'Q12b') {
      list.push({ questionId: q.id, optionKeys: ['1'] });
      continue;
    }
    if (q.options?.length) {
      list.push({
        questionId: q.id,
        optionKeys: [q.options[0].key],
        ...(q.alwaysShowDetailInput ? { otherText: 'Recorded detail' } : {}),
      });
    }
  }
  return list;
}
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
]);
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

function matchesHouseholdScope(h: any, whereH: any): boolean {
  if (!whereH) return true;
  if (Array.isArray(whereH.AND) && !whereH.AND.every((w: any) => matchesHouseholdScope(h, w))) return false;
  if (whereH.assignedVolunteerId && h.assignedVolunteerId !== whereH.assignedVolunteerId) return false;
  if (typeof whereH.clusterId === 'string' && h.clusterId !== whereH.clusterId) return false;
  if (whereH.clusterId?.in && !whereH.clusterId.in.includes(h.clusterId)) return false;
  return true;
}

class InMemoryStorage {
  driver = 'local' as const;
  blobs = new Map<string, Buffer>();
  async put(buf: Buffer, mime: string) {
    const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'pdf';
    const key = `${randomUUID()}.${ext}`;
    this.blobs.set(key, Buffer.from(buf));
    return key;
  }
  async get(key: string) {
    const b = this.blobs.get(key);
    if (!b) throw new Error(`Missing blob ${key}`);
    return b;
  }
  async remove(key: string) {
    this.blobs.delete(key);
  }
}

function createInMemoryPrisma() {
  const pwHash = bcrypt.hashSync('FieldTestPass!99', 4);
  const state = {
    users: new Map<string, any>(),
    clusters: new Map<string, any>(),
    settings: new Map<string, any>(),
    households: new Map<string, any>(),
    surveys: new Map<string, any>(),
    answers: [] as any[],
    syncRecords: new Map<string, any>(),
    documents: new Map<string, any>(),
    documentPages: new Map<string, any>(),
    reviews: [] as any[],
    audits: [] as any[],
    qualityResolutions: [] as any[],
    qualityEvents: [] as any[],
  };

  const reset = () => {
    state.users.clear();
    state.clusters.clear();
    state.settings.clear();
    state.households.clear();
    state.surveys.clear();
    state.answers.length = 0;
    state.syncRecords.clear();
    state.documents.clear();
    state.documentPages.clear();
    state.reviews.length = 0;
    state.audits.length = 0;
    state.qualityResolutions.length = 0;
    state.qualityEvents.length = 0;

    state.clusters.set('kandapara', { id: 'kandapara', code: 'CL-01', name: 'Kandapara', targetHouseholds: 25, mapX: 27, mapY: 50, active: true });
    state.clusters.set('chankhula', { id: 'chankhula', code: 'CL-02', name: 'Chankhula', targetHouseholds: 15, mapX: 25, mapY: 27, active: true });
    state.clusters.set('other', { id: 'other', code: 'CL-00', name: 'Other', targetHouseholds: 0, mapX: 50, mapY: 50, active: false });

    state.settings.set('study', { targetSample: 100, allowVolunteerDelete: true, requireDocumentsForSubmission: false });
    state.settings.set('docCategories', [
      { id: 'aadhaar', label: 'Aadhaar Card', labelHi: 'आधार', requiresLast4: true, requiredForSubmission: true, enabled: true },
      { id: 'family_photo', label: 'Family Photo', labelHi: 'फोटो', enabled: true },
    ]);

    const now = new Date();
    state.users.set('vol-1', {
      id: 'vol-1', name: 'Talha Volunteer', email: 'talha@m2s.test', mobile: '9999900001',
      role: 'VOLUNTEER', passwordHash: pwHash, active: true, tokenVersion: 1,
      clusterIds: ['kandapara'], targetHouseholds: 25, createdAt: now, lastActiveAt: now,
    });
    state.users.set('sup-chankhula', {
      id: 'sup-chankhula', name: 'Chankhula Supervisor', email: 'sup-c@m2s.test', mobile: '9999900002',
      role: 'SUPERVISOR', passwordHash: pwHash, active: true, tokenVersion: 1,
      clusterIds: ['chankhula'], createdAt: now, lastActiveAt: now,
    });
    state.users.set('sup-kandapara', {
      id: 'sup-kandapara', name: 'Kandapara Supervisor', email: 'sup-k@m2s.test', mobile: '9999900003',
      role: 'SUPERVISOR', passwordHash: pwHash, active: true, tokenVersion: 1,
      clusterIds: ['kandapara'], createdAt: now, lastActiveAt: now,
    });
    state.users.set('admin-1', {
      id: 'admin-1', name: 'Study Admin', email: 'admin@m2s.test', mobile: '9999900004',
      role: 'ADMIN', passwordHash: pwHash, active: true, tokenVersion: 1,
      clusterIds: [], createdAt: now, lastActiveAt: now,
    });
  };

  reset();

  const hydrateUser = (u: any) => (u ? { ...u, assignments: u.clusterIds.map((clusterId: string) => ({ clusterId })) } : null);
  const hydrateHousehold = (h: any) => {
    const cluster = state.clusters.get(h.clusterId);
    const docs = [...state.documents.values()]
      .filter((d) => d.householdId === h.id)
      .map((d) => ({ ...d, pages: [...state.documentPages.values()].filter((p) => p.documentId === d.id).sort((a, b) => a.pageNo - b.pageNo) }));
    const survey = [...state.surveys.values()].find((s) => s.householdId === h.id) ?? null;
    return { ...h, cluster, documents: docs, survey };
  };
  const hydrateSurvey = (s: any) => {
    const household = hydrateHousehold(state.households.get(s.householdId));
    const volunteer = state.users.get(s.volunteerId);
    const answers = state.answers.filter((a) => a.surveyId === s.id);
    const reviews = state.reviews
      .filter((r) => r.surveyId === s.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => {
        const rev = state.users.get(r.reviewerId);
        return { ...r, reviewer: { name: rev.name, role: rev.role } };
      });
    const qualityResolutions = state.qualityResolutions.filter((r) => r.surveyId === s.id);
    const qualityEvents = state.qualityEvents
      .filter((e) => e.surveyId === s.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return { ...s, household, volunteer, answers, reviews, qualityResolutions, qualityEvents };
  };
  const hydrateDoc = (d: any) => {
    const h = hydrateHousehold(state.households.get(d.householdId));
    const uploadedBy = state.users.get(d.uploadedById);
    const verifiedBy = d.verifiedById ? state.users.get(d.verifiedById) : null;
    const pages = [...state.documentPages.values()].filter((p) => p.documentId === d.id).sort((a, b) => a.pageNo - b.pageNo);
    return { ...d, household: h, uploadedBy, verifiedBy, pages };
  };

  const db: any = {
    state,
    reset,
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join(' ');
      if (sql.includes('MAX(CAST(SUBSTRING')) {
        let max = 1000;
        for (const h of state.households.values()) {
          const m = /^M2S-(\d{6})$/.exec(h.code);
          if (m) max = Math.max(max, Number(m[1]));
        }
        return [{ max }];
      }
      return [{ '?column?': 1 }];
    },
    $executeRaw: async () => 1,
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      const snap = {
        users: new Map([...state.users.entries()].map(([k, v]) => [k, structuredClone(v)])),
        clusters: new Map([...state.clusters.entries()].map(([k, v]) => [k, structuredClone(v)])),
        settings: new Map([...state.settings.entries()].map(([k, v]) => [k, structuredClone(v)])),
        households: new Map([...state.households.entries()].map(([k, v]) => [k, structuredClone(v)])),
        surveys: new Map([...state.surveys.entries()].map(([k, v]) => [k, structuredClone(v)])),
        syncRecords: new Map([...state.syncRecords.entries()].map(([k, v]) => [k, structuredClone(v)])),
        documents: new Map([...state.documents.entries()].map(([k, v]) => [k, structuredClone(v)])),
        documentPages: new Map([...state.documentPages.entries()].map(([k, v]) => [k, structuredClone(v)])),
        answers: structuredClone(state.answers),
        reviews: structuredClone(state.reviews),
        audits: structuredClone(state.audits),
        qualityResolutions: structuredClone(state.qualityResolutions),
        qualityEvents: structuredClone(state.qualityEvents),
      };
      try {
        return await fn(db);
      } catch (err) {
        for (const [k, m] of [
          ['users', snap.users],
          ['clusters', snap.clusters],
          ['settings', snap.settings],
          ['households', snap.households],
          ['surveys', snap.surveys],
          ['syncRecords', snap.syncRecords],
          ['documents', snap.documents],
          ['documentPages', snap.documentPages],
        ] as const) {
          state[k].clear();
          for (const [id, v] of m.entries()) state[k].set(id, v);
        }
        state.answers.splice(0, state.answers.length, ...snap.answers);
        state.reviews.splice(0, state.reviews.length, ...snap.reviews);
        state.audits.splice(0, state.audits.length, ...snap.audits);
        state.qualityResolutions.splice(0, state.qualityResolutions.length, ...snap.qualityResolutions);
        state.qualityEvents.splice(0, state.qualityEvents.length, ...snap.qualityEvents);
        throw err;
      }
    },
    questionnaireVersion: {
      findFirst: async () => ({ id: 'qv-1', version: 1, definition: QUESTIONNAIRE_DEF }),
    },
    setting: {
      findUnique: async ({ where }: any) => (state.settings.has(where.key) ? { key: where.key, value: state.settings.get(where.key) } : null),
      upsert: async ({ where, create, update }: any) => {
        const val = state.settings.has(where.key) ? update.value : create.value;
        state.settings.set(where.key, val);
        return { key: where.key, value: val };
      },
    },
    cluster: {
      findUnique: async ({ where }: any) => state.clusters.get(where.id) ?? null,
    },
    user: {
      findFirst: async ({ where }: any) => {
        for (const u of state.users.values()) {
          if (where.email && u.email === where.email) return hydrateUser(u);
          if (where.mobile && u.mobile === where.mobile) return hydrateUser(u);
        }
        return null;
      },
      findUnique: async ({ where }: any) => hydrateUser(state.users.get(where.id) ?? null),
      findUniqueOrThrow: async ({ where }: any) => {
        const u = state.users.get(where.id);
        if (!u) throw new Error(`User ${where.id} not found`);
        return hydrateUser(u);
      },
      update: async ({ where, data }: any) => {
        const u = state.users.get(where.id);
        Object.assign(u, data);
        return hydrateUser(u);
      },
    },
    household: {
      findUnique: async ({ where }: any) => (state.households.has(where.id) ? hydrateHousehold(state.households.get(where.id)) : null),
      create: async ({ data }: any) => {
        const row = { ...data, createdAt: new Date() };
        state.households.set(row.id, row);
        return hydrateHousehold(row);
      },
      update: async ({ where, data }: any) => {
        const row = state.households.get(where.id);
        Object.assign(row, data);
        return hydrateHousehold(row);
      },
      delete: async ({ where }: any) => {
        state.households.delete(where.id);
      },
    },
    syncRecord: {
      findUnique: async ({ where }: any) => state.syncRecords.get(where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        state.syncRecords.set(data.idempotencyKey, { ...data, createdAt: new Date() });
        return data;
      },
    },
    survey: {
      findMany: async ({ where }: any) =>
        [...state.surveys.values()]
          .filter((s) => (!where?.status || s.status === where.status) && matchesHouseholdScope(state.households.get(s.householdId), where?.household))
          .map(hydrateSurvey),
      findFirst: async ({ where }: any) => {
        const s = where.id ? state.surveys.get(where.id) : [...state.surveys.values()].find((x) => x.householdId === where.householdId);
        if (!s) return null;
        if (where.household && !matchesHouseholdScope(state.households.get(s.householdId), where.household)) return null;
        return hydrateSurvey(s);
      },
      findUnique: async ({ where }: any) => (state.surveys.has(where.id) ? hydrateSurvey(state.surveys.get(where.id)) : null),
      findUniqueOrThrow: async ({ where }: any) => {
        const s = state.surveys.get(where.id);
        if (!s) throw new Error('Survey not found');
        return hydrateSurvey(s);
      },
      create: async ({ data }: any) => {
        const now = new Date();
        const row = {
          status: 'DRAFT',
          submittedAt: null,
          gpsConsent: false,
          gpsLat: null,
          gpsLng: null,
          gpsAccuracyMeters: null,
          gpsCapturedAt: null,
          gpsPermissionStatus: null,
          startedAt: null,
          durationSec: null,
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        state.surveys.set(row.id, row);
        return hydrateSurvey(row);
      },
      updateMany: async ({ where, data }: any) => {
        const row = state.surveys.get(where.id);
        if (!row) return { count: 0 };
        if (where.revision !== undefined && row.revision !== where.revision) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(row.status)) return { count: 0 };
        const rev = data.revision?.increment ? row.revision + data.revision.increment : data.revision ?? row.revision;
        Object.assign(row, { ...data, revision: rev, updatedAt: new Date() });
        return { count: 1 };
      },
      update: async ({ where, data }: any) => {
        const row = state.surveys.get(where.id);
        const rev = data.revision?.increment ? row.revision + data.revision.increment : data.revision ?? row.revision;
        Object.assign(row, { ...data, revision: rev, updatedAt: new Date() });
        return hydrateSurvey(row);
      },
      delete: async ({ where }: any) => {
        for (let i = state.answers.length - 1; i >= 0; i--) {
          if (state.answers[i].surveyId === where.id) state.answers.splice(i, 1);
        }
        state.surveys.delete(where.id);
      },
    },
    answer: {
      deleteMany: async ({ where }: any) => {
        for (let i = state.answers.length - 1; i >= 0; i--) {
          if (state.answers[i].surveyId === where.surveyId) state.answers.splice(i, 1);
        }
      },
      createMany: async ({ data }: any) => {
        state.answers.push(...data);
      },
    },
    document: {
      findUnique: async ({ where }: any) => (state.documents.has(where.id) ? hydrateDoc(state.documents.get(where.id)) : null),
      findMany: async ({ where }: any) =>
        [...state.documents.values()]
          .filter((d) => {
            if (where?.householdId && d.householdId !== where.householdId) return false;
            if (where?.status && d.status !== where.status) return false;
            if (where?.verificationStatus && d.verificationStatus !== where.verificationStatus) return false;
            if (where?.id?.in && !where.id.in.includes(d.id)) return false;
            return matchesHouseholdScope(state.households.get(d.householdId), where?.household);
          })
          .map(hydrateDoc),
      create: async ({ data }: any) => {
        const id = data.id ?? randomUUID();
        const now = new Date();
        const { pages, ...rest } = data;
        const doc = { verificationStatus: 'PENDING', rejectionReason: null, verifiedById: null, verifiedAt: null, ...rest, id, createdAt: now };
        state.documents.set(id, doc);
        for (const p of pages?.create ?? []) {
          const pid = randomUUID();
          state.documentPages.set(pid, { ...p, id: pid, documentId: id });
        }
        return hydrateDoc(doc);
      },
      deleteMany: async ({ where }: any) => {
        for (const [id, d] of state.documents.entries()) {
          if (d.householdId === where.householdId) {
            for (const [pid, p] of state.documentPages.entries()) {
              if (p.documentId === id) state.documentPages.delete(pid);
            }
            state.documents.delete(id);
          }
        }
      },
    },
    documentPage: {
      findFirst: async ({ where }: any) => {
        const p = state.documentPages.get(where.id);
        if (!p || p.documentId !== where.documentId) return null;
        const d = state.documents.get(p.documentId);
        if (!d) return null;
        const h = state.households.get(d.householdId);
        if (where.document?.household && !matchesHouseholdScope(h, where.document.household)) return null;
        return { ...p, document: { ...d, household: h } };
      },
    },
    reviewAction: {
      create: async ({ data }: any) => {
        const row = { ...data, id: randomUUID(), createdAt: new Date() };
        state.reviews.push(row);
        return row;
      },
    },
    auditLog: {
      findMany: async ({ where }: any = {}) =>
        state.audits
          .filter((a) => (!where?.action || a.action === where.action) && (!where?.entityId || a.entityId === where.entityId))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      create: async ({ data }: any) => {
        const row = { ...data, id: randomUUID(), createdAt: new Date() };
        state.audits.push(row);
        return row;
      },
    },
    surveyQualityResolution: {
      findMany: async ({ where }: any = {}) =>
        state.qualityResolutions.filter((r) => !where?.surveyId || r.surveyId === where.surveyId),
      upsert: async ({ where, create, update }: any) => {
        const idx = state.qualityResolutions.findIndex((r) =>
          where?.id ? r.id === where.id : where?.surveyId_ruleId ? r.surveyId === where.surveyId_ruleId.surveyId && r.ruleId === where.surveyId_ruleId.ruleId : false
        );
        const now = new Date();
        if (idx >= 0) {
          state.qualityResolutions[idx] = { ...state.qualityResolutions[idx], ...update, updatedAt: now };
          return state.qualityResolutions[idx];
        }
        const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...create };
        state.qualityResolutions.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const idx = state.qualityResolutions.findIndex((r) =>
          where?.id ? r.id === where.id : where?.surveyId_ruleId ? r.surveyId === where.surveyId_ruleId.surveyId && r.ruleId === where.surveyId_ruleId.ruleId : false
        );
        if (idx < 0) throw new Error('Resolution not found');
        state.qualityResolutions[idx] = { ...state.qualityResolutions[idx], ...data, updatedAt: new Date() };
        return state.qualityResolutions[idx];
      },
    },
    surveyQualityEvent: {
      findMany: async ({ where }: any = {}) =>
        state.qualityEvents.filter((e) => !where?.surveyId || e.surveyId === where.surveyId),
      findUnique: async ({ where }: any) =>
        state.qualityEvents.find((e) =>
          where?.id
            ? e.id === where.id
            : where?.surveyId_clientEventId
              ? e.surveyId === where.surveyId_clientEventId.surveyId && e.clientEventId === where.surveyId_clientEventId.clientEventId
              : false
        ) ?? null,
      create: async ({ data }: any) => {
        const row = { id: data.id ?? randomUUID(), createdAt: data.createdAt ?? new Date(), ...data };
        state.qualityEvents.push(row);
        return row;
      },
      upsert: async ({ where, create, update }: any) => {
        const idx = state.qualityEvents.findIndex((e) =>
          where?.id
            ? e.id === where.id
            : where?.surveyId_clientEventId
              ? e.surveyId === where.surveyId_clientEventId.surveyId && e.clientEventId === where.surveyId_clientEventId.clientEventId
              : false
        );
        if (idx >= 0) {
          state.qualityEvents[idx] = { ...state.qualityEvents[idx], ...update };
          return state.qualityEvents[idx];
        }
        const row = { id: create.id ?? randomUUID(), createdAt: create.createdAt ?? new Date(), ...create };
        state.qualityEvents.push(row);
        return row;
      },
    },
  };
  return db;
}

describe('API HTTP Integration', () => {
  let app: INestApplication;
  let baseUrl: string;
  const mockDb = createInMemoryPrisma();
  const memStorage = new InMemoryStorage();

  @Module({
    imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET })],
    controllers: [HealthController, AuthController, SurveysController, SettingsController, DocumentsController, ExportsController],
    providers: [
      { provide: PrismaService, useValue: mockDb },
      { provide: StorageService, useValue: memStorage },
      ScannerService,
      AuditService,
      SettingsService,
      QuestionnaireService,
      SurveyQualityServerService,
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  })
  class TestApiModule {}

  beforeAll(async () => {
    // Vitest compiles TS via esbuild without emitDecoratorMetadata; supply constructor paramtypes explicitly.
    const meta = (target: object, deps: unknown[]) => Reflect.defineMetadata('design:paramtypes', deps, target);
    meta(AuditService, [PrismaService]);
    meta(SettingsService, [PrismaService]);
    meta(QuestionnaireService, [PrismaService]);
    meta(SurveyQualityServerService, [PrismaService, SettingsService, AuditService]);
    meta(AuthGuard, [JwtService, Reflector, PrismaService]);
    meta(HealthController, [PrismaService, StorageService, ScannerService]);
    meta(AuthController, [PrismaService, JwtService, AuditService]);
    meta(SurveysController, [PrismaService, AuditService, QuestionnaireService, StorageService, SettingsService, SurveyQualityServerService]);
    meta(SettingsController, [SettingsService, AuditService]);
    meta(DocumentsController, [PrismaService, StorageService, ScannerService, AuditService, SettingsService]);
    meta(ExportsController, [PrismaService, AuditService, QuestionnaireService, StorageService]);

    app = await NestFactory.create(TestApiModule, { logger: ['error'] });
    // Proxy headers are honoured only from trusted hops (loopback + a private-network proxy in the simulated chain).
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', ['loopback', 'uniquelocal']);
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDb.reset();
    memStorage.blobs.clear();
  });

  async function loginAs(email: string, appType?: 'admin' | 'volunteer') {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, password: 'FieldTestPass!99', ...(appType ? { app: appType } : {}) }),
    });
    const cookies = res.headers.getSetCookie?.() ?? [];
    const session = cookies.find((c) => c.startsWith('m2s_session='))?.split(';')[0] ?? '';
    return { res, cookie: session, setCookies: cookies };
  }

  function validSurveyPayload(overrides: Record<string, unknown> = {}) {
    const baseProfile = {
      surveyDate: '2026-11-10',
      clusterId: 'kandapara',
      districtCode: '1',
      docVerifiedCode: '0',
      headName: 'Aftab Khan',
      headStatusCode: '1',
      interviewer: 'Talha',
      totalMembers: 4,
      maleCount: 2,
      femaleCount: 2,
      ageUnder1: 0,
      age1to5: 1,
      age0to5: 1,
      age6to14: 1,
      age18to59: 2,
      incomeNowCode: '2',
      landOwnedCode: '2',
    };
    return {
      idempotencyKey: `idem-${randomUUID()}`,
      baseRevision: 0,
      consentGiven: true,
      durationSec: 360,
      profile: {
        ...baseProfile,
        ...((overrides.profile as Record<string, unknown> | undefined) ?? {}),
      },
      answers: defaultAnswers(),
      ...overrides,
      ...(overrides.profile
        ? { profile: { ...baseProfile, ...(overrides.profile as Record<string, unknown>) } }
        : {}),
    };
  }

  it('exposes public health telemetry and guards private routes with 401', async () => {
    const health = await fetch(`${baseUrl}/api/v1/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, storage: 'local', scanner: 'builtin' });

    const meUnauth = await fetch(`${baseUrl}/api/v1/auth/me`);
    expect(meUnauth.status).toBe(401);

    const surveysUnauth = await fetch(`${baseUrl}/api/v1/surveys`);
    expect(surveysUnauth.status).toBe(401);
  });

  it('authenticates with HttpOnly Strict cookies and blocks volunteers from admin console', async () => {
    const wrong = await loginAs('talha@m2s.test', 'admin');
    expect(wrong.res.status).toBe(401);

    const ok = await loginAs('talha@m2s.test', 'volunteer');
    expect(ok.res.status).toBe(200);
    expect(ok.setCookies[0]).toContain('HttpOnly');
    expect(ok.setCookies[0]).toContain('SameSite=Strict');

    const me = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: ok.cookie } });
    expect(me.status).toBe(200);
    expect((await me.json()).role).toBe('VOLUNTEER');

    // Browser admin login NEVER leaks token in JSON body; Capacitor volunteer login provides scoped bearer token
    const capRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-platform': 'capacitor' },
      body: JSON.stringify({ identifier: 'talha@m2s.test', password: 'FieldTestPass!99', app: 'volunteer' }),
    });
    expect(capRes.status).toBe(200);
    const capBody = await capRes.json();
    expect(typeof capBody.token).toBe('string');

    const bearerMe = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${capBody.token}` } });
    expect(bearerMe.status).toBe(200);
    expect((await bearerMe.json()).id).toBe('vol-1');
  });

  it('enforces GPS consent privacy and persists timing metadata', async () => {
    const { cookie } = await loginAs('talha@m2s.test');
    const id = randomUUID();

    // Coordinates sent without gpsConsent=true MUST be stripped
    const noConsentRes = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(
        validSurveyPayload({
          gpsConsent: false,
          gpsLat: 26.21,
          gpsLng: 92.95,
          gpsAccuracyMeters: 12.5,
          gpsPermissionStatus: 'granted',
          startedAt: '2026-11-10T09:00:00.000Z',
          durationSec: 420,
        })
      ),
    });
    expect(noConsentRes.status).toBe(200);
    const stripped = await noConsentRes.json();
    expect(stripped.gpsConsent).toBe(false);
    expect(stripped.gpsLat).toBeUndefined();
    expect(stripped.gpsLng).toBeUndefined();
    expect(stripped.durationSec).toBe(420);

    // With gpsConsent=true coordinates persist
    const withConsentRes = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(
        validSurveyPayload({
          baseRevision: 1,
          gpsConsent: true,
          gpsLat: 26.2145,
          gpsLng: 92.9512,
          gpsAccuracyMeters: 9.2,
          gpsCapturedAt: '2026-11-10T09:05:00.000Z',
          gpsPermissionStatus: 'granted',
        })
      ),
    });
    expect(withConsentRes.status).toBe(200);
    const saved = await withConsentRes.json();
    expect(saved.gpsConsent).toBe(true);
    expect(saved.gpsLat).toBeCloseTo(26.2145);
    expect(saved.gpsLng).toBeCloseTo(92.9512);
    expect(saved.gpsAccuracyMeters).toBeCloseTo(9.2);
  });

  it('handles survey creation idempotency, revision conflicts, and inactive clusters', async () => {
    const { cookie } = await loginAs('talha@m2s.test');
    const id = randomUUID();
    const first = validSurveyPayload();

    const r1 = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(first),
    });
    expect(r1.status).toBe(200);
    const created = await r1.json();
    expect(created.surveyCode).toBe('M2S-001001');
    expect(created.revision).toBe(1);

    // Retry with same idempotencyKey replays without bumping revision
    const rReplay = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(first),
    });
    expect(rReplay.status).toBe(200);
    expect((await rReplay.json()).revision).toBe(1);

    // Stale baseRevision=0 with new idempotencyKey triggers 409 REVISION_CONFLICT
    const rConflict = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(validSurveyPayload({ baseRevision: 0 })),
    });
    expect(rConflict.status).toBe(409);
    expect((await rConflict.json()).code).toBe('REVISION_CONFLICT');

    // Inactive cluster creation returns 400 INACTIVE_CLUSTER
    const inactiveId = randomUUID();
    const rInactive = await fetch(`${baseUrl}/api/v1/surveys/${inactiveId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(validSurveyPayload({ profile: { clusterId: 'other', headName: 'Test' } })),
    });
    expect(rInactive.status).toBe(400);
    expect((await rInactive.json()).code).toBe('INACTIVE_CLUSTER');
  });

  it('enforces malware/magic-byte checks, required-documents gate, and authenticated streaming', async () => {
    await mockDb.setting.upsert({
      where: { key: 'study' },
      create: { key: 'study', value: { targetSample: 100, allowVolunteerDelete: false, requireDocumentsForSubmission: true } },
      update: { value: { targetSample: 100, allowVolunteerDelete: false, requireDocumentsForSubmission: true } },
    });

    const { cookie } = await loginAs('talha@m2s.test');
    const id = randomUUID();

    // Direct submit fails without required Aadhaar document
    const blockedSubmit = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(validSurveyPayload({ submit: true })),
    });
    expect(blockedSubmit.status).toBe(400);
    expect((await blockedSubmit.json()).code).toBe('DOCUMENTS_REQUIRED');

    // Save draft first
    const draftRes = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(validSurveyPayload({ submit: false })),
    });
    expect(draftRes.status).toBe(200);

    // Volunteer delete blocked when allowVolunteerDelete=false
    const delBlocked = await fetch(`${baseUrl}/api/v1/surveys/${id}`, { method: 'DELETE', headers: { cookie } });
    expect(delBlocked.status).toBe(403);

    // Reject spoofed file bytes
    const fakeForm = new FormData();
    fakeForm.set('categoryId', 'aadhaar');
    fakeForm.set('aadhaarLast4', '4321');
    fakeForm.set('consentConfirmed', 'true');
    fakeForm.append('files', new Blob(['not an image'], { type: 'image/png' }), 'fake.png');
    const fakeRes = await fetch(`${baseUrl}/api/v1/households/${id}/documents`, { method: 'POST', headers: { cookie }, body: fakeForm });
    expect(fakeRes.status).toBe(400);

    // Reject EICAR payload disguised after PNG header with 422 MALWARE_DETECTED
    const eicarForm = new FormData();
    eicarForm.set('categoryId', 'aadhaar');
    eicarForm.set('aadhaarLast4', '4321');
    eicarForm.set('consentConfirmed', 'true');
    eicarForm.append('files', new Blob([Buffer.concat([PNG_BYTES, Buffer.from(EICAR)])], { type: 'image/png' }), 'eicar.png');
    const eicarRes = await fetch(`${baseUrl}/api/v1/households/${id}/documents`, { method: 'POST', headers: { cookie }, body: eicarForm });
    expect(eicarRes.status).toBe(422);
    expect((await eicarRes.json()).code).toBe('MALWARE_DETECTED');
    expect(mockDb.state.audits.some((a: any) => a.action === 'document_quarantined')).toBe(true);

    // Upload clean PNG
    const okForm = new FormData();
    okForm.set('categoryId', 'aadhaar');
    okForm.set('aadhaarLast4', '4321');
    okForm.set('consentConfirmed', 'true');
    okForm.append('files', new Blob([PNG_BYTES], { type: 'image/png' }), 'aadhaar.png');
    const okUpload = await fetch(`${baseUrl}/api/v1/households/${id}/documents`, { method: 'POST', headers: { cookie }, body: okForm });
    expect(okUpload.status).toBe(201);
    const doc = await okUpload.json();
    expect(doc.pages).toHaveLength(1);

    // Fetch uploaded bytes back and verify headers
    const contentRes = await fetch(`${baseUrl}${doc.pages[0].localPreviewUrl}`, { headers: { cookie } });
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await contentRes.arrayBuffer()).equals(PNG_BYTES)).toBe(true);

    // Now survey submit succeeds
    const submitted = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(validSurveyPayload({ baseRevision: 1, submit: true })),
    });
    expect(submitted.status).toBe(200);
    expect((await submitted.json()).status).toBe('SUBMITTED');
  });

  it('enforces supervisor scope, CSV formula-injection escaping, date filters, and ZIP streaming', async () => {
    const vol = await loginAs('talha@m2s.test');
    const supWrong = await loginAs('sup-c@m2s.test');
    const supRight = await loginAs('sup-k@m2s.test');
    const admin = await loginAs('admin@m2s.test');

    const id = randomUUID();
    await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(
        validSurveyPayload({
          submit: true,
          profile: { surveyDate: '2026-11-10', clusterId: 'kandapara', headName: '=CMD("calc")', interviewer: 'Talha', totalMembers: 4 },
        })
      ),
    });

    const upload = new FormData();
    upload.set('categoryId', 'family_photo');
    upload.set('consentConfirmed', 'true');
    upload.append('files', new Blob([PNG_BYTES], { type: 'image/png' }), 'photo.png');
    await fetch(`${baseUrl}/api/v1/households/${id}/documents`, { method: 'POST', headers: { cookie: vol.cookie }, body: upload });

    // Volunteer cannot hit exports
    const volExport = await fetch(`${baseUrl}/api/v1/exports/surveys.csv`, { headers: { cookie: vol.cookie } });
    expect(volExport.status).toBe(403);

    // Supervisor outside Kandapara gets 404 on Kandapara survey
    const wrongScope = await fetch(`${baseUrl}/api/v1/surveys/${id}`, { headers: { cookie: supWrong.cookie } });
    expect(wrongScope.status).toBe(404);

    // Kandapara supervisor approves survey
    const approve = await fetch(`${baseUrl}/api/v1/surveys/${id}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: supRight.cookie },
      body: JSON.stringify({ decision: 'APPROVE', reason: 'Verified in field' }),
    });
    expect(approve.status).toBe(200);
    expect((await approve.json()).status).toBe('APPROVED');

    // CSV escapes leading formula `=` and filters by date range
    const csvRes = await fetch(`${baseUrl}/api/v1/exports/surveys.csv?from=2026-11-01&to=2026-11-12`, {
      headers: { cookie: admin.cookie },
    });
    expect(csvRes.status).toBe(200);
    const csvText = await csvRes.text();
    expect(csvText).toContain(`"'=CMD(""calc"")"`);

    const emptyRange = await fetch(`${baseUrl}/api/v1/exports/surveys.csv?from=2025-01-01&to=2025-01-31`, {
      headers: { cookie: admin.cookie },
    });
    expect((await emptyRange.text()).trim().split('\n')).toHaveLength(1);

    // ZIP stream starts with PK\x03\x04 local file header and includes manifest.csv
    const zipRes = await fetch(`${baseUrl}/api/v1/exports/documents.zip`, { headers: { cookie: admin.cookie } });
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get('content-type')).toContain('application/zip');
    const zipBuf = Buffer.from(await zipRes.arrayBuffer());
    expect(zipBuf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(zipBuf.includes(Buffer.from('manifest.csv'))).toBe(true);
  });

  it('rejects invalid enum/UUID query filters cleanly and cleans up blobs on document create failure', async () => {
    const vol = await loginAs('talha@m2s.test');
    const admin = await loginAs('admin@m2s.test');

    const badStatusSurvey = await fetch(`${baseUrl}/api/v1/surveys?status=BOGUS`, { headers: { cookie: admin.cookie } });
    expect(badStatusSurvey.status).toBe(400);
    expect((await badStatusSurvey.json()).code).toBe('INVALID_STATUS');

    const badExportStatus = await fetch(`${baseUrl}/api/v1/exports/surveys.csv?status=BOGUS`, { headers: { cookie: admin.cookie } });
    expect(badExportStatus.status).toBe(400);
    expect((await badExportStatus.json()).code).toBe('INVALID_STATUS');

    const badVerifyZip = await fetch(`${baseUrl}/api/v1/exports/documents.zip?verification=BOGUS`, { headers: { cookie: admin.cookie } });
    expect(badVerifyZip.status).toBe(400);
    expect((await badVerifyZip.json()).code).toBe('INVALID_VERIFICATION');

    const badIdsZip = await fetch(`${baseUrl}/api/v1/exports/documents.zip?ids=not-a-uuid`, { headers: { cookie: admin.cookie } });
    expect(badIdsZip.status).toBe(400);
    expect((await badIdsZip.json()).code).toBe('INVALID_IDS');

    const badDocQuery = await fetch(`${baseUrl}/api/v1/documents?householdId=not-a-uuid`, { headers: { cookie: vol.cookie } });
    expect(badDocQuery.status).toBe(400);
    expect((await badDocQuery.json()).code).toBe('INVALID_HOUSEHOLD_ID');

    const hid = randomUUID();
    await fetch(`${baseUrl}/api/v1/surveys/${hid}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(validSurveyPayload()),
    });

    const invalidClientIdForm = new FormData();
    invalidClientIdForm.set('categoryId', 'family_photo');
    invalidClientIdForm.set('consentConfirmed', 'true');
    invalidClientIdForm.set('clientId', 'not-a-uuid');
    invalidClientIdForm.append('files', new Blob([PNG_BYTES], { type: 'image/png' }), 'photo.png');
    const badClientIdRes = await fetch(`${baseUrl}/api/v1/households/${hid}/documents`, {
      method: 'POST',
      headers: { cookie: vol.cookie },
      body: invalidClientIdForm,
    });
    expect(badClientIdRes.status).toBe(400);
    expect((await badClientIdRes.json()).code).toBe('INVALID_CLIENT_ID');

    // Simulate document.create DB failure and confirm stored blobs are rolled back cleanly
    const blobsBefore = memStorage.blobs.size;
    const origCreate = mockDb.document.create;
    mockDb.document.create = async () => {
      throw new Error('Simulated DB error');
    };
    try {
      const failForm = new FormData();
      failForm.set('categoryId', 'family_photo');
      failForm.set('consentConfirmed', 'true');
      failForm.append('files', new Blob([PNG_BYTES], { type: 'image/png' }), 'rollback.png');
      const failRes = await fetch(`${baseUrl}/api/v1/households/${hid}/documents`, {
        method: 'POST',
        headers: { cookie: vol.cookie },
        body: failForm,
      });
      expect(failRes.status).toBe(500);
      expect(memStorage.blobs.size).toBe(blobsBefore);
    } finally {
      mockDb.document.create = origCreate;
    }
  });

  it('enforces server-side quality validation, idempotent quality events, RBAC supervisor override, policy config, and semantic exports', async () => {
    const vol = await loginAs('talha@m2s.test');
    const sup = await loginAs('sup-k@m2s.test');
    const admin = await loginAs('admin@m2s.test');

    // 1. Q7=5 ("No children 6–14") + B4 age6to14=1 contradiction MUST block server submission with QUALITY_VALIDATION_BLOCKED
    const idBad = randomUUID();
    const q7Fail = await fetch(`${baseUrl}/api/v1/surveys/${idBad}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(
        validSurveyPayload({
          submit: true,
          answers: defaultAnswers({
            Q1a: { optionKeys: [Q1A.options[0].key], otherText: 'Settlement detail' },
            Q7: { optionKeys: ['5'] },
            Q14: { optionKeys: ['1'] },
            Q20: { optionKeys: ['2'], otherText: 'Informal loan Rs 5000' },
          }),
        })
      ),
    });
    expect(q7Fail.status).toBe(400);
    const errBody = await q7Fail.json();
    expect(errBody.code).toBe('QUALITY_VALIDATION_BLOCKED');

    // Save Q5=1 + Q13=1 warning survey as draft on a clean ID
    const idWarn = randomUUID();
    const saveDraft = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(
        validSurveyPayload({
          submit: false,
          answers: defaultAnswers({
            Q5: { optionKeys: ['1'] },
            Q13: { optionKeys: ['1'] },
            Q14: { optionKeys: ['3'] },
            Q20: { optionKeys: ['1'] },
          }),
        })
      ),
    });
    expect(saveDraft.status).toBe(200);

    // 2. Unverified Q5=1 + Q13=1 warning blocks submit when requireWarningAcknowledgement=true
    const q5q13Fail = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(
        validSurveyPayload({
          baseRevision: 1,
          submit: true,
          answers: defaultAnswers({
            Q5: { optionKeys: ['1'] },
            Q13: { optionKeys: ['1'] },
            Q14: { optionKeys: ['3'] },
            Q20: { optionKeys: ['1'] },
          }),
        })
      ),
    });
    expect(q5q13Fail.status).toBe(400);
    expect((await q5q13Fail.json()).code).toBe('QUALITY_VALIDATION_BLOCKED');

    // 3. Idempotent quality event verification with clientEventId resolves Q5/Q13 verified exception cleanly
    const evId = `evt-${randomUUID()}`;
    const qEvtPayload = {
      events: [
        {
          clientEventId: evId,
          ruleId: 'RULE_Q5_Q13_SHELTER_CONSISTENCY',
          action: 'VERIFIED',
          note: 'Family stays in roadside relief tent; owns damaged pucca structure in native village.',
          questionIds: ['Q5', 'Q13'],
        },
      ],
    };
    const ev1 = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}/quality-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(qEvtPayload),
    });
    expect(ev1.status).toBe(200);
    const ev2 = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}/quality-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(qEvtPayload),
    });
    expect(ev2.status).toBe(200);
    const evBody = await ev2.json();
    expect(evBody.qualityHistory.filter((h: any) => h.clientEventId === evId)).toHaveLength(1);
    const q5Res = evBody.qualityResolutions.find((r: any) => r.ruleId === 'RULE_Q5_Q13_SHELTER_CONSISTENCY');
    expect(q5Res?.status).toBe('SUPERVISOR_REVIEW_REQUIRED');

    // Blind click-to-dismiss on strict Q7 ERROR contradiction MUST fail (400)
    const idQ7 = randomUUID();
    await fetch(`${baseUrl}/api/v1/surveys/${idQ7}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(
        validSurveyPayload({
          submit: false,
          profile: {
            headName: 'Rohan Ali',
          },
          answers: defaultAnswers({
            Q7: { optionKeys: ['5'] },
          }),
        })
      ),
    });
    const blindDismiss = await fetch(`${baseUrl}/api/v1/surveys/${idQ7}/quality-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify({
        events: [
          {
            clientEventId: `dismiss-${randomUUID()}`,
            ruleId: 'RULE_Q7_DEMOGRAPHIC_CONSISTENCY',
            action: 'VERIFIED',
            note: 'Volunteer tried clicking verify without fixing contradiction',
            questionIds: ['Q7'],
          },
        ],
      }),
    });
    expect(blindDismiss.status).toBe(400);

    // 4. Volunteer CANNOT invoke supervisor override (403); empty reason is 400; supervisor CAN override with reason & audit trail
    const volOverride = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}/quality-override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify({ ruleIds: ['RULE_Q5_Q13_SHELTER_CONSISTENCY'], reason: 'Trying self-override' }),
    });
    expect(volOverride.status).toBe(403);

    const emptyReasonOverride = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}/quality-override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sup.cookie },
      body: JSON.stringify({ ruleIds: ['RULE_Q5_Q13_SHELTER_CONSISTENCY'], reason: 'no' }),
    });
    expect(emptyReasonOverride.status).toBe(400);

    const supOverride = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}/quality-override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sup.cookie },
      body: JSON.stringify({
        ruleIds: ['RULE_Q5_Q13_SHELTER_CONSISTENCY'],
        reason: 'Verified split dual-shelter status with village head.',
      }),
    });
    expect(supOverride.status).toBe(200);
    const overridden = await supOverride.json();
    expect(overridden.qualityOverrides).toHaveLength(1);
    expect(mockDb.state.audits.some((a: any) => a.action === 'survey_quality_override' && a.entityId === idWarn)).toBe(true);

    // Now submission succeeds on server
    const submitOk = await fetch(`${baseUrl}/api/v1/surveys/${idWarn}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: vol.cookie },
      body: JSON.stringify(
        validSurveyPayload({
          baseRevision: 1,
          submit: true,
          answers: defaultAnswers({
            Q5: { optionKeys: ['1'] },
            Q13: { optionKeys: ['1'] },
            Q14: { optionKeys: ['3'] },
            Q20: { optionKeys: ['1'] },
          }),
        })
      ),
    });
    const submitOkBody = await submitOk.json();
    expect(submitOk.status, JSON.stringify(submitOkBody)).toBe(200);
    expect(submitOkBody.status).toBe('SUBMITTED');

    // 5. Quality policy settings endpoint updates & persists config
    const policyRes = await fetch(`${baseUrl}/api/v1/settings/quality-policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        blockOnErrors: true,
        requireWarningAcknowledgement: false,
        allowSupervisorOverride: true,
        escalateVerifiedExceptionsToSupervisor: true,
        minDurationSec: 90,
      }),
    });
    expect(policyRes.status).toBe(200);
    expect((await policyRes.json()).minDurationSec).toBe(90);

    // 6. Semantic exports expose Q14 & Q20 semantic categories accurately
    const csvRes = await fetch(`${baseUrl}/api/v1/exports/surveys.csv`, { headers: { cookie: admin.cookie } });
    expect(csvRes.status).toBe(200);
    const csv = await csvRes.text();
    expect(csv).toContain('q14OptionKey');
    expect(csv).toContain('q14SemanticCategory');
    expect(csv).toContain('unsafe_water_deprived');
    expect(csv).toContain('active_bank_no_new_debt');
  });

  it('captures live volunteer IP, IP location, GPS fix via /auth/location and exposes submittedIp to reviewers', async () => {
    const vol = await loginAs('talha@m2s.test', 'volunteer');
    const admin = await loginAs('admin@m2s.test', 'admin');

    // Login recorded network IP on user row
    const meBefore = await (await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: vol.cookie } })).json();
    expect(meBefore.lastIp).toBeTruthy();

    // Location ping captures forwarded client IP, proxy geo header, and GPS coordinates
    const pingRes = await fetch(`${baseUrl}/api/v1/auth/location`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: vol.cookie,
        'x-forwarded-for': '203.0.113.42, 10.0.0.1',
        'x-vercel-ip-city': 'Nagaon',
        'x-vercel-ip-country-region': 'AS',
        'x-vercel-ip-country': 'IN',
      },
      body: JSON.stringify({
        gpsLat: 26.2155,
        gpsLng: 92.9522,
        gpsAccuracyMeters: 7.5,
        gpsCapturedAt: '2026-11-12T05:30:00.000Z',
        gpsPermissionStatus: 'granted',
        clusterName: 'Kandapara',
      }),
    });
    expect(pingRes.status).toBe(200);
    const pingBody = await pingRes.json();
    expect(pingBody.ok).toBe(true);
    expect(pingBody.ip).toBe('203.0.113.42');
    expect(pingBody.ipLocation).toBe('Nagaon, AS, IN');
    expect(pingBody.lastGpsLat).toBeCloseTo(26.2155);
    expect(pingBody.lastGpsLng).toBeCloseTo(92.9522);
    expect(pingBody.lastLocationLabel).toBe('Kandapara');

    // Survey save records submittedIp + submittedIpLocation; returned to admin, hidden from volunteer listing
    const id = randomUUID();
    const putRes = await fetch(`${baseUrl}/api/v1/surveys/${id}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: vol.cookie,
        'x-forwarded-for': '203.0.113.88',
        'x-vercel-ip-city': 'Hojai',
        'x-vercel-ip-country': 'IN',
      },
      body: JSON.stringify(
        validSurveyPayload({
          gpsConsent: true,
          gpsLat: 26.2158,
          gpsLng: 92.9525,
          gpsAccuracyMeters: 6.0,
        })
      ),
    });
    expect(putRes.status).toBe(200);
    const volSaved = await putRes.json();
    expect(volSaved.submittedIp).toBeUndefined();

    const adminGetRes = await fetch(`${baseUrl}/api/v1/surveys/${id}`, { headers: { cookie: admin.cookie } });
    expect(adminGetRes.status).toBe(200);
    const adminSurvey = await adminGetRes.json();
    expect(adminSurvey.submittedIp).toBe('203.0.113.88');
    expect(adminSurvey.submittedIpLocation).toBe('Hojai, IN');
    expect(adminSurvey.gpsLat).toBeCloseTo(26.2158);
  });
});

// DEMO / TRAINING DATA ONLY — refuses to run when NODE_ENV=production.
// Loads the sample households, documents and team from apps/web/src/data/mockData.ts into the database
// so every screen can be exercised against the real API. All demo accounts share DEMO_PASSWORD from .env.
// Run `npm run seed` first (questionnaire, clusters, categories).
import '../src/env';
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { createInitialDocuments, createInitialSurveys, INITIAL_USERS } from './demo-fixtures/mockData';

if (process.env.NODE_ENV === 'production') throw new Error('seed-demo must never run in production.');
const password = process.env.DEMO_PASSWORD ?? '';
if (password.length < 10) throw new Error('Set DEMO_PASSWORD (10+ chars) in apps/api/.env first.');

const storageDir = resolve(process.env.STORAGE_DIR || './.storage');
function storeLocal(bytes: Buffer) {
  const key = randomBytes(24).toString('hex');
  mkdirSync(join(storageDir, key.slice(0, 2)), { recursive: true });
  writeFileSync(join(storageDir, key.slice(0, 2), key), bytes, { mode: 0o600 });
  return key;
}
const svgBytes = (dataUrl: string) => Buffer.from(decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')), 'utf8');

(async () => {
  const db = new PrismaClient();
  if (process.env.S3_BUCKET) throw new Error('seed-demo writes demo files to local storage; unset S3_BUCKET for demo seeding.');
  const qv = await db.questionnaireVersion.findFirst({ orderBy: { version: 'desc' } });
  if (!qv) throw new Error('Run `npm run seed` first.');
  if (await db.survey.count()) {
    console.log('Database already has surveys — demo seed skipped. Use `npm run db:reset` for a clean slate.');
    return db.$disconnect();
  }

  const hash = await bcrypt.hash(password, 12);
  const userIds = new Map<string, string>();
  for (const u of INITIAL_USERS) {
    const row = await db.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        mobile: u.mobile || null,
        name: u.name,
        role: u.role as Role,
        active: u.active,
        targetHouseholds: u.targetHouseholds ?? null,
        passwordHash: hash,
        lastActiveAt: new Date(u.lastActive),
        assignments: { create: u.assignedClusterIds.map((clusterId) => ({ clusterId })) },
      },
      update: {},
    });
    userIds.set(u.id, row.id);
  }
  const reviewerId = userIds.get('u-sup-1')!;
  const adminId = userIds.get('u-admin-1')!;

  const surveys = createInitialSurveys();
  const surveyIds = new Map<string, string>();
  for (const s of surveys) {
    const id = randomUUID();
    surveyIds.set(s.householdId, id);
    const volunteerId = userIds.get(s.volunteerId)!;
    await db.household.create({ data: { id, clusterId: s.clusterId, code: s.surveyCode, headName: s.profile.headName, assignedVolunteerId: volunteerId, createdAt: new Date(s.createdAt) } });
    await db.survey.create({
      data: {
        id,
        householdId: id,
        volunteerId,
        questionnaireVersionId: qv.id,
        status: s.status === 'PENDING_SYNC' ? 'DRAFT' : s.status,
        revision: s.revision,
        consentGiven: s.consentGiven,
        profile: { ...s.profile, surveyCode: s.surveyCode } as object,
        submittedAt: s.submittedAt ? new Date(s.submittedAt) : null,
        createdAt: new Date(s.createdAt),
        answers: {
          create: Object.values(s.answers).map((a) => ({ questionId: a.questionId, optionKeys: a.optionKeys, optionCodes: a.optionCodes, otherText: a.otherText ?? null })),
        },
        reviews: {
          create: s.reviews.map((r) => ({ reviewerId, decision: r.decision, reason: r.reason, createdAt: new Date(r.createdAt) })),
        },
      },
    });
    if (s.submittedAt) {
      await db.auditLog.create({
        data: { actorId: volunteerId, action: 'survey_submit', entity: 'survey', entityId: id, summary: `Survey ${s.surveyCode} submitted by ${s.volunteerName}`, createdAt: new Date(s.submittedAt) },
      });
    }
    for (const r of s.reviews) {
      await db.auditLog.create({
        data: { actorId: reviewerId, action: `survey_${r.decision.toLowerCase()}`, entity: 'survey', entityId: id, summary: `${s.surveyCode} ${r.decision === 'APPROVE' ? 'approved' : 'reviewed'} by Dr. Samta Pandya`, createdAt: new Date(r.createdAt) },
      });
    }
  }

  const docs = createInitialDocuments(surveys);
  for (const d of docs) {
    const householdId = surveyIds.get(d.householdId);
    if (!householdId) continue;
    const uploadedById = userIds.get(d.uploadedById) ?? adminId;
    const doc = await db.document.create({
      data: {
        householdId,
        categoryId: d.categoryId,
        docType: d.docType,
        aadhaarLast4: d.aadhaarLast4 ?? null,
        consentConfirmed: true,
        status: 'AVAILABLE',
        verificationStatus: d.verificationStatus,
        rejectionReason: d.rejectionReason ?? null,
        uploadedById,
        verifiedById: d.verificationStatus === 'PENDING' ? null : adminId,
        verifiedAt: d.verifiedAt ? new Date(d.verifiedAt) : d.verificationStatus === 'PENDING' ? null : new Date(d.uploadedAt),
        createdAt: new Date(d.uploadedAt),
        pages: {
          create: d.pages.map((p) => {
            const bytes = svgBytes(p.localPreviewUrl);
            return {
              objectKey: storeLocal(bytes),
              fileName: p.fileName.replace(/\.\w+$/, '.svg'),
              mime: 'image/svg+xml', // demo previews only; real uploads are restricted to JPG / PNG / PDF
              sizeBytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              pageNo: p.pageNo,
            };
          }),
        },
      },
    });
    await db.auditLog.create({
      data: { actorId: uploadedById, action: 'document_upload', entity: 'document', entityId: doc.id, summary: `${d.docType} uploaded for ${d.surveyCode} by ${d.uploadedByName}`, createdAt: new Date(d.uploadedAt) },
    });
  }

  console.log(`Demo data: ${INITIAL_USERS.length} users, ${surveys.length} surveys, ${docs.length} documents.`);
  console.log('Demo sign-in: any seeded email or mobile with DEMO_PASSWORD from apps/api/.env');
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

import type { Prisma } from '@prisma/client';

/**
 * Maps database rows to the JSON shapes the web app uses (see apps/web/src/types/survey.ts).
 * Keeping one mapping layer means every endpoint returns identical shapes.
 */

export const surveyInclude = {
  household: { include: { cluster: true } },
  volunteer: { select: { id: true, name: true } },
  answers: true,
  reviews: { include: { reviewer: { select: { name: true, role: true } } }, orderBy: { createdAt: 'desc' } },
  qualityResolutions: { orderBy: { updatedAt: 'desc' } },
  qualityEvents: { orderBy: { createdAt: 'desc' }, take: 100 },
} satisfies Prisma.SurveyInclude;
export type SurveyRow = Prisma.SurveyGetPayload<{ include: typeof surveyInclude }>;

export function toSurvey(s: SurveyRow, includeTelemetry = false) {
  const profile = (s.profile ?? {}) as Record<string, unknown>;
  return {
    id: s.id,
    householdId: s.householdId,
    surveyCode: s.household.code,
    clusterId: s.household.clusterId,
    clusterName: s.household.cluster.name,
    volunteerId: s.volunteerId,
    volunteerName: s.volunteer.name,
    status: s.status,
    revision: s.revision,
    consentGiven: s.consentGiven,
    gpsConsent: s.gpsConsent,
    ...(s.gpsConsent && s.gpsLat != null && s.gpsLng != null
      ? {
          gpsLat: s.gpsLat,
          gpsLng: s.gpsLng,
          gpsAccuracyMeters: s.gpsAccuracyMeters ?? undefined,
          gpsCapturedAt: s.gpsCapturedAt?.toISOString(),
        }
      : {}),
    gpsPermissionStatus: s.gpsPermissionStatus ?? undefined,
    ...(includeTelemetry && s.submittedIp
      ? {
          submittedIp: s.submittedIp,
          submittedIpLocation: s.submittedIpLocation ?? undefined,
        }
      : {}),
    startedAt: s.startedAt?.toISOString(),
    durationSec: s.durationSec ?? undefined,
    profile: { ...profile, surveyCode: s.household.code },
    answers: Object.fromEntries(
      s.answers.map((a) => [
        a.questionId,
        { questionId: a.questionId, optionKeys: a.optionKeys, optionCodes: a.optionCodes, otherText: a.otherText ?? undefined },
      ])
    ),
    reviews: s.reviews.map((r) => ({
      id: r.id,
      decision: r.decision,
      reviewerName: r.reviewer.name,
      reviewerRole: r.reviewer.role,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
    qualityResolutions: s.qualityResolutions.map((qr) => ({
      id: qr.id,
      surveyId: qr.surveyId,
      ruleId: qr.ruleId,
      ruleVersion: qr.ruleVersion,
      status: qr.status as any,
      note: qr.note ?? undefined,
      verifiedById: qr.verifiedById ?? undefined,
      verifiedByName: qr.verifiedByName ?? undefined,
      verifiedAt: qr.verifiedAt?.toISOString(),
      answerSnapshot: (qr.answerSnapshot ?? undefined) as any,
      supervisorStatus: (qr.supervisorStatus ?? undefined) as any,
      supervisorNote: qr.supervisorNote ?? undefined,
      reviewedById: qr.reviewedById ?? undefined,
      reviewedByName: qr.reviewedByName ?? undefined,
      reviewedAt: qr.reviewedAt?.toISOString(),
      clientEventId: qr.clientEventId ?? undefined,
      updatedAt: qr.updatedAt.toISOString(),
    })),
    qualityHistory: s.qualityEvents.map((ev) => ({
      id: ev.id,
      surveyId: ev.surveyId,
      ruleId: ev.ruleId,
      ruleTitle: ev.ruleTitle,
      severity: ev.severity as any,
      eventType: ev.eventType as any,
      status: ev.status as any,
      timestamp: ev.createdAt.toISOString(),
      actorId: ev.actorId ?? undefined,
      actorName: ev.actorName ?? undefined,
      actorRole: (ev.actorRole ?? undefined) as any,
      note: ev.note ?? undefined,
      previousAnswers: (ev.previousAnswers ?? undefined) as any,
      updatedAnswers: (ev.updatedAnswers ?? undefined) as any,
      supervisorStatus: ev.supervisorStatus ?? undefined,
      clientEventId: ev.clientEventId,
    })),
    qualityOverrides: s.qualityResolutions
      .filter((qr) => qr.status === 'WAIVED_WITH_REASON')
      .map((qr) => {
        const matchEv = s.qualityEvents.find(
          (e) => e.ruleId === qr.ruleId && (e.eventType === 'OVERRIDE_APPLIED' || e.eventType === 'SUPERVISOR_WAIVED')
        );
        return {
          id: qr.id,
          surveyId: qr.surveyId,
          ruleIds: [qr.ruleId],
          reason: qr.supervisorNote ?? qr.note ?? 'Supervisor override',
          actorId: qr.reviewedById ?? matchEv?.actorId ?? '',
          actorName: qr.reviewedByName ?? matchEv?.actorName ?? 'Supervisor',
          actorRole: (matchEv?.actorRole ?? 'SUPERVISOR') as any,
          createdAt: (qr.reviewedAt ?? qr.updatedAt).toISOString(),
          active: true,
        };
      }),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    submittedAt: s.submittedAt?.toISOString(),
  };
}

export const documentInclude = {
  household: { include: { cluster: true } },
  uploadedBy: { select: { id: true, name: true } },
  verifiedBy: { select: { name: true } },
  pages: { orderBy: { pageNo: 'asc' } },
} satisfies Prisma.DocumentInclude;
export type DocumentRow = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

export const pageContentUrl = (docId: string, pageId: string) => `/api/v1/documents/${docId}/pages/${pageId}/content`;

export function toDocument(d: DocumentRow) {
  return {
    id: d.id,
    householdId: d.householdId,
    surveyCode: d.household.code,
    headName: d.household.headName ?? '',
    clusterName: d.household.cluster.name,
    categoryId: d.categoryId,
    docType: d.docType,
    aadhaarLast4: d.aadhaarLast4 ?? undefined,
    consentConfirmed: d.consentConfirmed,
    uploadStatus: 'UPLOADED' as const,
    uploadProgress: 100,
    verificationStatus: d.verificationStatus,
    rejectionReason: d.rejectionReason ?? undefined,
    uploadedById: d.uploadedById,
    uploadedByName: d.uploadedBy.name,
    uploadedAt: d.createdAt.toISOString(),
    verifiedByName: d.verifiedBy?.name,
    verifiedAt: d.verifiedAt?.toISOString(),
    pages: d.pages.map((p) => ({
      id: p.id,
      pageNo: p.pageNo,
      fileName: p.fileName,
      mime: p.mime,
      sizeBytes: p.sizeBytes,
      localPreviewUrl: pageContentUrl(d.id, p.id),
    })),
  };
}

export const userInclude = { assignments: { select: { clusterId: true } } } satisfies Prisma.UserInclude;
export type UserRow = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export function toUser(u: UserRow, includeTelemetry = false) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    mobile: u.mobile ?? '',
    role: u.role,
    assignedClusterIds: u.assignments.map((a) => a.clusterId),
    active: u.active,
    lastActive: (u.lastActiveAt ?? u.createdAt).toISOString(),
    targetHouseholds: u.targetHouseholds ?? undefined,
    ...(includeTelemetry
      ? {
          lastIp: u.lastIp ?? undefined,
          lastIpLocation: u.lastIpLocation ?? undefined,
          lastGpsLat: u.lastGpsLat ?? undefined,
          lastGpsLng: u.lastGpsLng ?? undefined,
          lastGpsAccuracy: u.lastGpsAccuracy ?? undefined,
          lastGpsCapturedAt: u.lastGpsCapturedAt?.toISOString(),
          lastLocationLabel: u.lastLocationLabel ?? undefined,
        }
      : {}),
  };
}

export function toCluster(c: { id: string; code: string; name: string; targetHouseholds: number; mapX: number; mapY: number; active: boolean }) {
  return { id: c.id, code: c.code, name: c.name, targetHouseholds: c.targetHouseholds, mapX: c.mapX, mapY: c.mapY, active: c.active };
}

export const auditInclude = { actor: { select: { name: true, role: true } } } satisfies Prisma.AuditLogInclude;
export type AuditRow = Prisma.AuditLogGetPayload<{ include: typeof auditInclude }>;

export function toAudit(a: AuditRow, withIp = false) {
  return {
    id: a.id,
    actorName: a.actor?.name ?? 'System',
    actorRole: a.actor?.role ?? 'SUPER_ADMIN',
    action: a.action,
    entity: a.entity,
    entityId: a.entityId ?? '',
    summary: a.summary ?? `${a.action.replace(/_/g, ' ')} (${a.entity})`,
    createdAt: a.createdAt.toISOString(),
    ...(withIp && a.ip ? { ip: a.ip } : {}),
  };
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CircleCheck,
  CircleX,
  ClipboardCheck,
  Download,
  Printer,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  FilePlus2,
} from 'lucide-react';
import { defaultQualityService } from '@m2s/shared/validation';
import { evaluateHouseholdIndices } from '@m2s/shared/utils/studyIndicators';
import { QualitySummaryCard, type QualityResolutionActionType } from '@m2s/shared/components/QualitySummaryCard';
import { formatDocVerifiedLabels, parseDocVerifiedCodes } from '@m2s/shared/survey/surveyModel';
import { buildHouseholdCaseFilePdfBlob } from '@m2s/shared/utils/caseFilePdf';
import { triggerFileDownload } from '../../utils/exportHelpers';
import type {
  HouseholdDocument,
  Language,
  QualityIssue,
  QuestionAnswer,
  QuestionDef,
  ReviewDecision,
  Role,
  SurveyRecord,
  SurveyStatus,
} from '../../types/survey';
import { DetailDrawer } from '../../components/ui/DetailDrawer';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DocThumb, maskAadhaar } from '../../components/ui/DocumentCard';
import { DocumentPreview } from '../../components/ui/DocumentPreview';
import { PART1_LABELS, PART1_OPTIONS, QUESTIONS, SURVEY_SECTIONS } from '../../data/questionnaire';
import { relativeTime, shortDate } from '../../components/dashboard/format';
import { googleMapsUrl } from '@m2s/shared/utils/gpsCapture';
import { useAppStore } from '../../store/appStore';

/* ------------------------------------------------------------------ */
/* Role / status helpers (shared by the survey and review pages)       */
/* ------------------------------------------------------------------ */

export const isAdminRole = (r: Role) => r === 'SUPER_ADMIN' || r === 'ADMIN';
export const isReviewerRole = (r: Role) => isAdminRole(r) || r === 'SUPERVISOR';

const RE_REVIEWABLE: SurveyStatus[] = ['APPROVED', 'REJECTED', 'RETURNED'];
const DECISION_RESULT: Record<ReviewDecision, SurveyStatus> = { APPROVE: 'APPROVED', RETURN: 'RETURNED', REJECT: 'REJECTED' };

/** Supervisors review SUBMITTED surveys only; admins can also re-review decided ones. */
export const canReviewSurvey = (role: Role, status: SurveyStatus) =>
  isReviewerRole(role) && (status === 'SUBMITTED' || (isAdminRole(role) && RE_REVIEWABLE.includes(status)));

/** Decisions available for a survey (never the one that would leave its status unchanged). */
export const decisionsFor = (role: Role, status: SurveyStatus): ReviewDecision[] =>
  canReviewSurvey(role, status)
    ? (['APPROVE', 'RETURN', 'REJECT'] as ReviewDecision[]).filter((d) => DECISION_RESULT[d] !== status)
    : [];

export const isAnswered = (a?: QuestionAnswer) =>
  !!a && (a.optionKeys.length > 0 || a.optionCodes.length > 0 || (a.otherText ?? '').trim().length > 0);

export const answerStats = (s: SurveyRecord) => {
  const answered = QUESTIONS.filter((q) => isAnswered(s.answers[q.id])).length;
  return { answered, total: QUESTIONS.length, pct: Math.round((answered / QUESTIONS.length) * 100) };
};

export const docStats = (docs: HouseholdDocument[]) => ({
  total: docs.length,
  verified: docs.filter((d) => d.verificationStatus === 'VERIFIED').length,
  pending: docs.filter((d) => d.verificationStatus === 'PENDING').length,
  rejected: docs.filter((d) => d.verificationStatus === 'REJECTED').length,
});

/** Option labels for an answer (falls back to codes if the questionnaire changed). */
export function answerLabels(q: QuestionDef, a: QuestionAnswer | undefined, lang: Language = 'en'): string[] {
  if (!a) return [];
  const opts = q.options ?? [];
  const out: string[] = [];
  a.optionKeys.forEach((k, i) => {
    const o = opts.find((x) => x.key === k) ?? opts.find((x) => x.code === a.optionCodes[i]);
    out.push(o ? (lang === 'hi' ? o.hi : o.en) : `Code ${a.optionCodes[i] ?? k}`);
  });
  if (a.optionKeys.length === 0) {
    a.optionCodes.forEach((c) => {
      const o = opts.find((x) => x.code === c);
      out.push(o ? (lang === 'hi' ? o.hi : o.en) : `Code ${c}`);
    });
  }
  return out;
}

const surveyLabel = (s: SurveyRecord) => s.surveyCode || 'Unsynced survey';

const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ROLE_LABEL: Record<Role, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', SUPERVISOR: 'Supervisor', VOLUNTEER: 'Volunteer' };

/* ------------------------------------------------------------------ */
/* Profile (B1–B10)                                                    */
/* ------------------------------------------------------------------ */

type Opt = { code: string; en: string; hi: string };
const pick = (list: Opt[], code: string, lang: Language) => {
  const o = list.find((x) => x.code === code);
  if (o) return lang === 'hi' ? o.hi : o.en;
  if (code === '6' || code === '7') return lang === 'hi' ? 'अन्य संवेदनशील स्थिति' : 'Other Vulnerability';
  return code || '—';
};

function profileRows(s: SurveyRecord, lang: Language): { id: string; label: string; value: React.ReactNode }[] {
  const p = s.profile;
  const under1 = p.ageUnder1 ?? 0;
  const age1to5 = p.age1to5 ?? Math.max(0, p.age0to5 - under1);
  const L = (k: keyof typeof PART1_LABELS) => (lang === 'hi' ? PART1_LABELS[k].hi : PART1_LABELS[k].en);
  const vulnerable = p.vulnerableCodes.length
    ? p.vulnerableCodes.map((c) => pick(PART1_OPTIONS.b5Vulnerable, c, lang)).join(', ')
    : 'None recorded';
  return [
    {
      id: 'B1',
      label: L('B1'),
      value: (
        <>
          {pick(PART1_OPTIONS.b1Districts, p.districtCode ?? '', lang)}
          {p.districtCode === '16' && p.districtOther ? ` (${p.districtOther})` : ''}
          {p.revenueCircleVillage ? ` · ${p.revenueCircleVillage}` : ''}
          <span className="block text-[12px] text-[#5C5547] mt-0.5">
            Cluster: {p.clusterName || s.clusterName} · Code: {s.surveyCode || '—'} · {p.surveyDate ? shortDate(p.surveyDate) : '—'}
          </span>
        </>
      ),
    },
    {
      id: 'B2',
      label: L('B2'),
      value: (
        <>
          {p.docVerifiedLabel || formatDocVerifiedLabels(parseDocVerifiedCodes(p.docVerifiedCode), lang) || '—'}
          {p.docVerifiedOther && <span className="block text-[12px] text-[#5C5547]">Other ID: {p.docVerifiedOther}</span>}
          {p.idLast4 && <span className="ml-2 font-mono text-[#8C6200]">{maskAadhaar(p.idLast4)}</span>}
        </>
      ),
    },
    {
      id: 'B3',
      label: L('B3'),
      value: `${p.headName || '—'}${p.headAge !== '' ? `, ${p.headAge} yrs` : ''} · ${pick(PART1_OPTIONS.b3HeadStatus, p.headStatusCode, lang)}${p.headStatusOther ? ` (${p.headStatusOther})` : ''}`,
    },
    {
      id: 'B4',
      label: L('B4'),
      value: (
        <>
          <span className="font-semibold">{p.totalMembers} members</span> — {p.maleCount} male, {p.femaleCount} female
          {p.otherGenderCount ? `, ${p.otherGenderCount} other` : ''}
          <span className="block text-[12px] text-[#5C5547] mt-0.5">
            &lt;1yr: {under1} · 1–5yr: {age1to5} · 6–14: {p.age6to14} · 15–17: {p.age15to17} · 18–59: {p.age18to59} · 60+: {p.age60Plus}
          </span>
        </>
      ),
    },
    { id: 'B5', label: L('B5'), value: vulnerable },
    {
      id: 'B6',
      label: L('B6'),
      value: `${pick(PART1_OPTIONS.b6Religion, p.religionCode, lang)}${p.religionOther ? ` (${p.religionOther})` : ''}`,
    },
    {
      id: 'B7',
      label: L('B7'),
      value: `${p.casteName || '—'} · ${pick(PART1_OPTIONS.b7CasteCategory, p.casteCategoryCode, lang)}`,
    },
    {
      id: 'B8',
      label: L('B8'),
      value: `${pick(PART1_OPTIONS.b8Language, p.primaryLanguageCode, lang)}${p.primaryLanguageOther ? ` (${p.primaryLanguageOther})` : ''}`,
    },
    {
      id: 'B9',
      label: L('B9'),
      value: (
        <>
          Now: {pick(PART1_OPTIONS.b9Income, p.incomeNowCode, lang)}
          {p.incomeBeforeApprox && <span className="block text-[12px] text-[#5C5547] mt-0.5">Before eviction: {p.incomeBeforeApprox}</span>}
        </>
      ),
    },
    {
      id: 'B10',
      label: L('B10'),
      value: (
        <>
          {pick(PART1_OPTIONS.b10LandOwned, p.landOwnedCode ?? '', lang)}
          {p.landOwnedCode === '1' && (
            <span className="block text-[12px] text-[#5C5547] mt-0.5">
              {p.landBighas || pick(PART1_OPTIONS.b10LandSize, p.landSizeCode ?? '', lang)} ·{' '}
              {pick(PART1_OPTIONS.b10LandDocType, p.landDocTypeCode ?? '', lang)}
              {p.landDocOther ? ` (${p.landDocOther})` : ''}
            </span>
          )}
        </>
      ),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Detail body (shared with AdminReviews)                              */
/* ------------------------------------------------------------------ */

export type DetailTab = 'overview' | 'responses' | 'documents' | 'history';

export const SurveyDetailTabs: React.FC<{
  survey: SurveyRecord;
  docs: HouseholdDocument[];
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  className?: string;
}> = ({ survey, docs, tab, onTab, className = '' }) => {
  const stats = answerStats(survey);
  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'responses', label: `Responses (${stats.answered}/${stats.total})` },
    { id: 'documents', label: `Documents (${docs.length})` },
    { id: 'history', label: `History (${survey.reviews.length})` },
  ];
  return (
    <div role="tablist" className={`flex items-end gap-1 px-3 overflow-x-auto no-scrollbar ${className}`}>
      {tabs.map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onTab(t.id)}
            className={`relative px-3 pt-2.5 pb-2 text-[13.5px] whitespace-nowrap transition-colors ${
              on ? 'text-[#8C6200] font-semibold' : 'text-[#363127] hover:text-[#6E4D00]'
            }`}
          >
            {t.label}
            {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-[#FDC513]" />}
          </button>
        );
      })}
    </div>
  );
};

const Card: React.FC<{ title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  extra,
  children,
  className = '',
}) => (
  <section className={`bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)] ${className}`}>
    {title && (
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <h3 className="text-[15px] font-bold text-[#181611]">{title}</h3>
        {extra}
      </header>
    )}
    <div className={title ? 'px-4 pb-4' : 'p-4'}>{children}</div>
  </section>
);

export const CompletenessBar: React.FC<{ answered: number; total: number; className?: string }> = ({ answered, total, className = '' }) => {
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const color = pct >= 90 ? 'bg-[#FDC513]' : pct >= 60 ? 'bg-[#E59500]' : 'bg-[#D64545]';
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 rounded-full bg-[#EFECE2] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11.5px] font-semibold tabular-nums text-[#5C5547] whitespace-nowrap">
        {answered}/{total}
      </span>
    </div>
  );
};

export const DocStatusSummary: React.FC<{ docs: HouseholdDocument[]; className?: string }> = ({ docs, className = '' }) => {
  const d = docStats(docs);
  if (d.total === 0) return <span className={`text-[12px] text-[#8E8675] ${className}`}>No documents</span>;
  return (
    <span className={`inline-flex items-center gap-2.5 text-[12px] text-[#363127] ${className}`}>
      {d.verified > 0 && (
        <span className="inline-flex items-center gap-1" title="Verified">
          <span className="w-2 h-2 rounded-full bg-[#D4A100]" />
          {d.verified} verified
        </span>
      )}
      {d.pending > 0 && (
        <span className="inline-flex items-center gap-1" title="Pending verification">
          <span className="w-2 h-2 rounded-full bg-[#4A7FD4]" />
          {d.pending} pending
        </span>
      )}
      {d.rejected > 0 && (
        <span className="inline-flex items-center gap-1" title="Rejected">
          <span className="w-2 h-2 rounded-full bg-[#D64545]" />
          {d.rejected} rejected
        </span>
      )}
    </span>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="text-[11.5px] font-semibold text-[#726C5D]">{label}</div>
    <div className="text-[13.5px] text-[#181611] mt-0.5 truncate">{children}</div>
  </div>
);

const DocGrid: React.FC<{ docs: HouseholdDocument[]; onPreview: (d: HouseholdDocument) => void; large?: boolean }> = ({
  docs,
  onPreview,
  large,
}) =>
  docs.length === 0 ? (
    <p className="py-4 text-center text-[13px] text-[#726C5D]">No documents uploaded for this household.</p>
  ) : (
    <ul className={`grid gap-3 ${large ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
      {docs.map((d) => (
        <li key={d.id}>
          <button
            type="button"
            onClick={() => onPreview(d)}
            className="group w-full text-left"
            aria-label={`Preview ${d.docType}`}
          >
            <span className="relative block rounded-[10px] border border-[#DFD9C8] overflow-hidden group-hover:ring-2 group-hover:ring-[#FDC513]/40 transition">
              <DocThumb doc={d} className="w-full aspect-[4/3]" />
              {d.pages.length > 1 && (
                <span className="absolute bottom-1 right-1 h-[18px] px-1.5 rounded bg-[#181611]/70 text-white text-[10.5px] font-medium leading-[18px]">
                  {d.pages.length} pages
                </span>
              )}
            </span>
            <span className="mt-1.5 block text-[12.5px] font-semibold text-[#181611] truncate group-hover:text-[#6E4D00]">
              {d.docType}
            </span>
            <span className="mt-0.5 block">
              <StatusBadge status={d.verificationStatus} labelOverride={d.verificationStatus === 'PENDING' ? 'Pending' : undefined} dot />
            </span>
            {large && d.aadhaarLast4 && (
              <span className="mt-0.5 block text-[11.5px] font-mono text-[#8C6200]">{maskAadhaar(d.aadhaarLast4)}</span>
            )}
            {large && d.rejectionReason && (
              <span className="mt-1 block text-[11.5px] text-[#B42318] leading-snug line-clamp-2">{d.rejectionReason}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );

type TimelineItem = { id: string; at: string; tone: 'green' | 'amber' | 'red' | 'grey' | 'blue'; title: string; detail?: string };

function timeline(s: SurveyRecord): TimelineItem[] {
  const items: TimelineItem[] = s.reviews.map((r) => ({
    id: r.id,
    at: r.createdAt,
    tone: r.decision === 'APPROVE' ? 'green' : r.decision === 'RETURN' ? 'amber' : 'red',
    title: `${r.decision === 'APPROVE' ? 'Approved' : r.decision === 'RETURN' ? 'Returned for corrections' : 'Rejected'} by ${r.reviewerName} (${
      ROLE_LABEL[r.reviewerRole] ?? r.reviewerRole
    })`,
    detail: r.reason && r.reason !== 'Approved.' ? r.reason : undefined,
  }));
  if (s.submittedAt) items.push({ id: 'submitted', at: s.submittedAt, tone: 'blue', title: `Submitted for review by ${s.volunteerName}` });
  items.push({ id: 'created', at: s.createdAt, tone: 'grey', title: `Survey started by ${s.volunteerName}` });
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

const TONE_DOT: Record<TimelineItem['tone'], string> = {
  green: 'bg-[#D4A100]',
  amber: 'bg-[#E0A010]',
  red: 'bg-[#D64545]',
  grey: 'bg-[#9E9683]',
  blue: 'bg-[#2D69B3]',
};
const TONE_ICON: Record<TimelineItem['tone'], React.ComponentType<{ className?: string }>> = {
  green: CircleCheck,
  amber: RotateCcw,
  red: CircleX,
  grey: FilePlus2,
  blue: Send,
};

export const SurveyDetailBody: React.FC<{
  survey: SurveyRecord;
  docs: HouseholdDocument[];
  tab: DetailTab;
  onTab?: (t: DetailTab) => void;
  onPreviewDocument: (d: HouseholdDocument) => void;
}> = ({ survey, docs, tab, onTab, onPreviewDocument }) => {
  const {
    language,
    surveys,
    currentUser,
    docCategories,
    study,
    qualityPolicy,
    recordQualityAction,
    overrideQualityIssues,
    notify,
  } = useAppStore();
  const [onlyMissing, setOnlyMissing] = useState(false);
  const stats = answerStats(survey);
  const latestReview = [...survey.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const requiredDocCategoryIds = useMemo(
    () => (study.requireDocumentsForSubmission ? docCategories.filter((c) => c.enabled && c.requiredForSubmission).map((c) => c.id) : []),
    [study.requireDocumentsForSubmission, docCategories]
  );
  const quality = useMemo(
    () =>
      defaultQualityService.evaluate({
        survey,
        documents: docs,
        peerSurveys: surveys,
        requiredDocCategoryIds,
        policy: qualityPolicy,
      }),
    [survey, docs, surveys, requiredDocCategoryIds, qualityPolicy]
  );
  const canSupervisorAct = isReviewerRole(currentUser.role);
  const allowSupervisorOverride = canSupervisorAct && qualityPolicy.allowSupervisorOverride;
  const indices = useMemo(() => evaluateHouseholdIndices(survey), [survey]);
  const canSeeGps = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'].includes(currentUser.role);

  if (tab === 'responses') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CompletenessBar answered={stats.answered} total={stats.total} className="w-56" />
          <label className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[#363127] cursor-pointer select-none">
            <input type="checkbox" className="m2s-check" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Show unanswered only
          </label>
        </div>
        {SURVEY_SECTIONS.map((sec) => {
          const qs = QUESTIONS.filter((q) => q.section === sec.id).filter((q) => !onlyMissing || !isAnswered(survey.answers[q.id]));
          if (qs.length === 0) return null;
          return (
            <Card
              key={sec.id}
              title={
                <>
                  <span className="text-[#8C6200]">Section {sec.id}</span> · {language === 'hi' ? sec.titleHi : sec.titleEn}
                </>
              }
              extra={<span className="text-[12px] font-medium text-[#726C5D] whitespace-nowrap">{sec.range}</span>}
            >
              <ol className="divide-y divide-[#EFECE2]">
                {qs.map((q) => {
                  const a = survey.answers[q.id];
                  const labels = answerLabels(q, a, language);
                  const text = a?.otherText?.trim();
                  const answered = isAnswered(a);
                  return (
                    <li key={q.id} id={`drawer-q-${q.id}`} className="py-2.5 first:pt-0 last:pb-0 flex gap-3">
                      <span className="shrink-0 w-9 h-[22px] rounded-md bg-[#EFECE2] text-[11.5px] font-semibold text-[#4A4336] flex items-center justify-center">
                        {q.id}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-[#363127] leading-snug">{language === 'hi' ? q.hi : q.en}</p>
                        {answered ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {labels.map((l, i) => (
                              <span key={i} className="inline-flex items-center min-h-[24px] px-2 py-0.5 rounded-md bg-[#FFF8D6] text-[12.5px] font-medium text-[#8C6200] leading-snug">
                                {l}
                              </span>
                            ))}
                            {text && (
                              <span className="w-full text-[13px] text-[#181611] bg-[#FAF8F2] border border-[#EFECE2] rounded-md px-2.5 py-1.5 leading-snug whitespace-pre-wrap">
                                {text}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-[12.5px] italic text-[#8E8675]">Not answered</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          );
        })}
        {onlyMissing && stats.answered === stats.total && (
          <p className="py-6 text-center text-[13px] text-[#5C5547]">Every question has an answer.</p>
        )}
      </div>
    );
  }

  if (tab === 'documents') {
    return (
      <Card title="Household documents" extra={<DocStatusSummary docs={docs} />}>
        <DocGrid docs={docs} onPreview={onPreviewDocument} large />
      </Card>
    );
  }

  if (tab === 'history') {
    const items = timeline(survey);
    return (
      <Card title="Review history">
        <ol className="relative mt-1">
          <span aria-hidden="true" className="absolute left-[13px] top-3 bottom-3 w-px bg-[#DFD9C8]" />
          {items.map((it) => {
            const Icon = TONE_ICON[it.tone];
            return (
              <li key={it.id} className="relative flex gap-3.5 pb-4 last:pb-0">
                <span className={`relative z-10 w-[27px] h-[27px] rounded-full ring-[3px] ring-white flex items-center justify-center text-white shrink-0 ${TONE_DOT[it.tone]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[13.5px] font-medium text-[#181611] leading-snug">{it.title}</p>
                  {it.detail && (
                    <p className="mt-1 text-[13px] text-[#363127] bg-[#FAF8F2] border border-[#EFECE2] rounded-md px-2.5 py-1.5 leading-snug">
                      “{it.detail}”
                    </p>
                  )}
                  <p className="mt-0.5 text-[12px] text-[#726C5D]">
                    {fmtDateTime(it.at)} · {relativeTime(it.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    );
  }

  /* overview */
  return (
    <div className="space-y-4">
      {latestReview && latestReview.decision !== 'APPROVE' && (survey.status === 'RETURNED' || survey.status === 'REJECTED') && (
        <div
          className={`rounded-[12px] border px-4 py-3 text-[13px] leading-snug ${
            survey.status === 'REJECTED' ? 'bg-[#FFF6F5] border-[#F5D2CF] text-[#7A1F17]' : 'bg-[#FFF7EE] border-[#F6DCC0] text-[#7A3A0B]'
          }`}
        >
          <strong className="font-semibold">
            {survey.status === 'REJECTED' ? 'Rejected' : 'Returned'} by {latestReview.reviewerName}:
          </strong>{' '}
          {latestReview.reason}
        </div>
      )}

      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
          <Fact label="Cluster / Village">{survey.clusterName || '—'}</Fact>
          <Fact label="Volunteer">{survey.volunteerName || '—'}</Fact>
          <Fact label="Survey date">{survey.profile.surveyDate ? shortDate(survey.profile.surveyDate) : '—'}</Fact>
          <Fact label="Submitted">{survey.submittedAt ? fmtDateTime(survey.submittedAt) : 'Not yet'}</Fact>
          <Fact label="Last updated">{fmtDateTime(survey.updatedAt)}</Fact>
          <Fact label="Consent">
            {survey.consentGiven ? (
              <span className="inline-flex items-center gap-1 text-[#8C6200] font-medium">
                <ShieldCheck className="w-4 h-4" /> Given
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[#B42318] font-medium">
                <ShieldAlert className="w-4 h-4" /> Not recorded
              </span>
            )}
          </Fact>
          <Fact label="Interview Duration">{survey.durationSec ? `${Math.round(survey.durationSec)}s` : 'Not recorded'}</Fact>
          <Fact label="GPS Location (Consent-Based)">
            {!survey.gpsConsent ? (
              <span className="text-[#726C5D]">Not consented</span>
            ) : !canSeeGps ? (
              <span className="text-[#726C5D]">Consented (restricted role)</span>
            ) : survey.gpsLat != null && survey.gpsLng != null ? (
              <span className="inline-flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[12px] text-[#8C6200]">
                  {survey.gpsLat.toFixed(5)}, {survey.gpsLng.toFixed(5)} (±{Math.round(survey.gpsAccuracyMeters ?? 0)}m)
                </span>
                <a
                  href={googleMapsUrl(survey.gpsLat, survey.gpsLng)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] font-semibold text-[#217045] hover:underline"
                >
                  Open Map ↗
                </a>
              </span>
            ) : (
              <span className="text-[#726C5D]">Consented, no fix</span>
            )}
          </Fact>
          <Fact label="Submitted IP / Network">
            {!canSeeGps ? (
              <span className="text-[#726C5D]">Restricted role</span>
            ) : survey.submittedIp ? (
              <span>
                <span className="font-mono text-[12px] text-[#181611]">{survey.submittedIp}</span>
                {survey.submittedIpLocation && <span className="text-[12px] text-[#5C5547]"> · {survey.submittedIpLocation}</span>}
              </span>
            ) : (
              <span className="text-[#726C5D]">Not recorded</span>
            )}
          </Fact>
          <div className="col-span-2 sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 pt-3 border-t border-[#EFECE2]">
            <div>
              <div className="text-[11.5px] font-semibold text-[#726C5D] mb-1">Answers</div>
              <button type="button" onClick={() => onTab?.('responses')} className="w-full text-left" disabled={!onTab}>
                <CompletenessBar answered={stats.answered} total={stats.total} />
              </button>
            </div>
            <div>
              <div className="text-[11.5px] font-semibold text-[#726C5D] mb-1">Documents</div>
              <DocStatusSummary docs={docs} />
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Composite Poverty & Humanitarian Indices"
        extra={<span className="text-[11.5px] font-medium text-[#726C5D]">UNDP MPI · Hunger Q11 · Sphere</span>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-[10px] border border-[#E7E2D4] bg-[#FAF8F2] px-3 py-2.5">
            <div className="text-[11px] font-semibold text-[#5C5547]">UNDP / NITI Aayog MPI (12 Indicators)</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-[18px] font-bold tabular-nums ${indices.isMpiPoor ? 'text-[#B42318]' : 'text-[#8C6200]'}`}>
                {indices.mpiScorePct}%
              </span>
              <span className="text-[12px] font-semibold text-[#363127]">{indices.mpiBandLabel}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-[#5C5547]">
              {indices.mpiDeprivedCount} / {indices.mpiAnsweredCount || 12} deprived
              {indices.mpiDeprivedItems.length > 0 && ` (${indices.mpiDeprivedItems.map((i) => i.qId).join(', ')})`}
            </div>
          </div>
          <div className="rounded-[10px] border border-[#E7E2D4] bg-[#FAF8F2] px-3 py-2.5">
            <div className="text-[11px] font-semibold text-[#5C5547]">Household Hunger Scale (Q11)</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={`text-[18px] font-bold tabular-nums ${
                  indices.hhsScore >= 4 ? 'text-[#B42318]' : indices.hhsScore >= 2 ? 'text-[#B54708]' : 'text-[#8C6200]'
                }`}
              >
                {indices.hhsScore} / 6
              </span>
              <span className="text-[12px] font-semibold text-[#363127]">{indices.hhsCategory}</span>
            </div>
            <div className="mt-1 text-[11.5px] text-[#5C5547]">Post-eviction household food recall</div>
          </div>
        </div>
        {(indices.dueProcessBreach ||
          indices.tookInformalDebt ||
          indices.idLostOrBuried ||
          indices.pdsBlocked ||
          indices.hasTouziOrPatta ||
          indices.genderedWashAcute ||
          indices.pre1971Settlement ||
          indices.zeroCashIncome) && (
          <div className="mt-3 pt-3 border-t border-[#EFECE2] space-y-2 text-[12px]">
            <div className="flex flex-wrap gap-1.5">
              {indices.pre1971Settlement && (
                <span className="px-2 py-0.5 rounded-full bg-[#EDF8F1] text-[#217045] font-semibold">Pre-1971 Settlement (Q1a)</span>
              )}
              {indices.zeroCashIncome && (
                <span className="px-2 py-0.5 rounded-full bg-[#FDECEC] text-[#B42318] font-semibold">Destitute Income (B9 / Q22)</span>
              )}
              {indices.tookInformalDebt && (
                <span className="px-2 py-0.5 rounded-full bg-[#F3E8FF] text-[#6B21A8] font-semibold">New Informal Debt (Q20)</span>
              )}
              {indices.dueProcessBreach && (
                <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] font-semibold">Notice &lt;7d / None (Q4)</span>
              )}
              {indices.genderedWashAcute && (
                <span className="px-2 py-0.5 rounded-full bg-[#FCE7F3] text-[#9D174D] font-semibold">Women WASH Deficit (Q16)</span>
              )}
              {indices.hasTouziOrPatta && (
                <span className="px-2 py-0.5 rounded-full bg-[#FFF8D6] text-[#8C6200] font-semibold">Patta / Forest / Touzi (B10)</span>
              )}
              {indices.idLostOrBuried && (
                <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] font-semibold">Docs Lost / Buried (Q24)</span>
              )}
              {indices.pdsBlocked && (
                <span className="px-2 py-0.5 rounded-full bg-[#FDECEC] text-[#B42318] font-semibold">Welfare / PDS Blocked (Q25b)</span>
              )}
            </div>
          </div>
        )}
      </Card>

      <QualitySummaryCard
        report={quality}
        title="Survey Quality & Supervisor Advisories"
        canVerify={false}
        canSupervisorAct={canSupervisorAct}
        allowSupervisorOverride={allowSupervisorOverride}
        onJumpTo={
          onTab
            ? (_sectionKey, questionId) => {
                onTab('responses');
                if (questionId) {
                  window.setTimeout(() => {
                    document.getElementById(`drawer-q-${questionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 60);
                }
              }
            : undefined
        }
        onRecordAction={
          canSupervisorAct
            ? async (issue: QualityIssue, action: QualityResolutionActionType, note?: string) => {
                await recordQualityAction(survey, issue, action, note);
                notify('Supervisor quality review updated.');
              }
            : undefined
        }
        onOverrideIssue={
          allowSupervisorOverride
            ? async (issue: QualityIssue, reason: string) => {
                const ruleKey = issue.ruleId || issue.id;
                await overrideQualityIssues(survey.id, [ruleKey], reason);
                notify('Supervisor exception override recorded in audit trail.');
              }
            : undefined
        }
      />

      <Card title="Household profile" extra={<span className="text-[12px] font-medium text-[#726C5D]">B1–B10</span>}>
        <dl className="divide-y divide-[#EFECE2]">
          {profileRows(survey, language).map((r) => (
            <div key={r.id} className="py-2 first:pt-0 last:pb-0 grid grid-cols-[36px_minmax(0,1fr)] sm:grid-cols-[36px_minmax(0,0.9fr)_minmax(0,1.1fr)] gap-x-3 gap-y-0.5">
              <dt className="row-span-2 sm:row-span-1 text-[11.5px] font-semibold text-[#8C6200] pt-0.5">{r.id}</dt>
              <dt className="text-[12.5px] text-[#5C5547] leading-snug">{r.label}</dt>
              <dd className="text-[13px] text-[#181611] leading-snug break-words">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card
        title={`Documents (${docs.length})`}
        extra={
          onTab && docs.length > 0 ? (
            <button type="button" onClick={() => onTab('documents')} className="text-[13px] font-semibold text-[#8C6200] hover:text-[#6E4D00]">
              View all
            </button>
          ) : undefined
        }
      >
        <DocGrid docs={docs.slice(0, 8)} onPreview={onPreviewDocument} />
      </Card>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Review decision dialog (shared with AdminSurveys / AdminReviews)    */
/* ------------------------------------------------------------------ */

const DECISION_COPY: Record<ReviewDecision, { title: string; label: string; variant: 'primary' | 'warning' | 'danger'; done: string }> = {
  APPROVE: { title: 'Approve survey', label: 'Approve', variant: 'primary', done: 'approved' },
  RETURN: { title: 'Return for corrections', label: 'Return to volunteer', variant: 'warning', done: 'returned to the volunteer' },
  REJECT: { title: 'Reject survey', label: 'Reject survey', variant: 'danger', done: 'rejected' },
};

export const ReviewDecisionDialog: React.FC<{
  survey: SurveyRecord | null;
  decision: ReviewDecision | null;
  onCancel: () => void;
  onDone?: (saved: SurveyRecord) => void;
}> = ({ survey, decision, onCancel, onDone }) => {
  const { reviewSurvey, notify } = useAppStore();
  const copy = decision ? DECISION_COPY[decision] : DECISION_COPY.APPROVE;
  const name = survey ? `${surveyLabel(survey)}${survey.profile.headName ? ` (${survey.profile.headName})` : ''}` : '';
  return (
    <ConfirmDialog
      open={!!survey && !!decision}
      title={copy.title}
      description={
        decision === 'APPROVE' ? (
          <>
            Mark <strong className="text-[#181611]">{name}</strong> as approved. It will count towards the completed sample.
          </>
        ) : decision === 'RETURN' ? (
          <>
            Send <strong className="text-[#181611]">{name}</strong> back to {survey?.volunteerName || 'the volunteer'} for corrections. They will
            see your reason.
          </>
        ) : (
          <>
            Reject <strong className="text-[#181611]">{name}</strong>. Rejected surveys are excluded from analysis. The volunteer will see your
            reason.
          </>
        )
      }
      variant={copy.variant}
      confirmLabel={copy.label}
      requireReason={decision === 'RETURN' || decision === 'REJECT'}
      reasonLabel={decision === 'RETURN' ? 'What needs to be corrected?' : 'Reason for rejection'}
      reasonPlaceholder={
        decision === 'RETURN' ? 'e.g. Q14 and Q15 are missing; please re-check family size (B9).' : 'e.g. Duplicate of an existing household.'
      }
      onCancel={onCancel}
      onConfirm={async (reason) => {
        if (!survey || !decision) return;
        const saved = await reviewSurvey(survey.id, decision, reason);
        notify(`${surveyLabel(survey)} ${copy.done}.`);
        onDone?.(saved);
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Print layout                                                        */
/* ------------------------------------------------------------------ */

const PRINT_CSS = `
@media screen { .m2s-print-root { display: none !important; } }
@media print {
  @page { margin: 14mm 12mm; }
  body { background: #fff !important; }
  body > *:not(.m2s-print-root) { display: none !important; }
  .m2s-print-root { display: block !important; color: #111; font-family: Inter, system-ui, sans-serif; font-size: 10.5pt; line-height: 1.4; }
  .m2s-print-root h1 { font-size: 16pt; margin: 0 0 2pt; }
  .m2s-print-root h2 { font-size: 11.5pt; margin: 14pt 0 5pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #D9AE00; color: #5C4100; break-after: avoid; }
  .m2s-print-root table { width: 100%; border-collapse: collapse; }
  .m2s-print-root td, .m2s-print-root th { border: 0.75pt solid #D8D1BE; padding: 3pt 5pt; vertical-align: top; text-align: left; }
  .m2s-print-root th { background: #EFECE2; font-weight: 600; }
  .m2s-print-root tr { break-inside: avoid; }
  .m2s-print-root .muted { color: #555; }
}
`;

const PrintableSurvey: React.FC<{ survey: SurveyRecord; docs: HouseholdDocument[]; printedBy: string; role: Role }> = ({
  survey,
  docs,
  printedBy,
  role,
}) => {
  const stats = answerStats(survey);
  const canSeeGps = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'].includes(role);
  return (
    <div className="m2s-print-root">
      <style>{PRINT_CSS}</style>
      <h1>
        Household Case File: {surveyLabel(survey)} — {survey.profile.headName || 'Household'}
      </h1>
      <div className="muted">
        Status: {survey.status} · Cluster: {survey.clusterName} · Volunteer: {survey.volunteerName} · Survey date: {survey.profile.surveyDate} · Revision{' '}
        {survey.revision} · Consent: {survey.consentGiven ? 'given' : 'not recorded'} · Duration: {survey.durationSec ? `${survey.durationSec}s` : 'N/A'} ·
        GPS: {survey.gpsConsent && canSeeGps && survey.gpsLat != null ? `${survey.gpsLat.toFixed(5)}, ${survey.gpsLng?.toFixed(5)}` : 'Not included'} · Answers:{' '}
        {stats.answered}/{stats.total}
      </div>
      <div className="muted">
        Printed {fmtDateTime(new Date().toISOString())} by {printedBy}. Confidential — contains household survey data.
      </div>

      <h2>Household profile (B1–B10)</h2>
      <table>
        <tbody>
          {profileRows(survey, 'en').map((r) => (
            <tr key={r.id}>
              <th style={{ width: '6%' }}>{r.id}</th>
              <td style={{ width: '38%' }}>{r.label}</td>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {SURVEY_SECTIONS.map((sec) => (
        <React.Fragment key={sec.id}>
          <h2>
            Section {sec.id}: {sec.titleEn} ({sec.range})
          </h2>
          <table>
            <tbody>
              {QUESTIONS.filter((q) => q.section === sec.id).map((q) => {
                const a = survey.answers[q.id];
                const labels = answerLabels(q, a, 'en');
                const text = a?.otherText?.trim();
                return (
                  <tr key={q.id}>
                    <th style={{ width: '6%' }}>{q.id}</th>
                    <td style={{ width: '50%' }}>{q.en}</td>
                    <td>
                      {isAnswered(a) ? (
                        <>
                          {labels.join('; ')}
                          {text && (
                            <>
                              {labels.length > 0 && <br />}
                              <em>{text}</em>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="muted">Not answered</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </React.Fragment>
      ))}

      <h2>Documents ({docs.length})</h2>
      {docs.length === 0 ? (
        <div className="muted">No documents uploaded.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Pages</th>
              <th>Verification</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.docType}
                  {d.aadhaarLast4 ? ` (${maskAadhaar(d.aadhaarLast4)})` : ''}
                </td>
                <td>{d.pages.length}</td>
                <td>
                  {d.verificationStatus}
                  {d.rejectionReason ? ` — ${d.rejectionReason}` : ''}
                </td>
                <td>
                  {d.uploadedByName}, {fmtDateTime(d.uploadedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Review history</h2>
      <table>
        <tbody>
          {timeline(survey).map((it) => (
            <tr key={it.id}>
              <td style={{ width: '24%' }}>{fmtDateTime(it.at)}</td>
              <td>
                {it.title}
                {it.detail ? ` — “${it.detail}”` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Drawer                                                              */
/* ------------------------------------------------------------------ */

interface HouseholdDetailDrawerProps {
  survey: SurveyRecord | null;
  onClose: () => void;
  onPreviewDocument?: (doc: HouseholdDocument) => void;
  /** Called after a review decision is saved (e.g. to advance a queue). */
  onReviewed?: (saved: SurveyRecord) => void;
}

const btnBase = 'h-9 px-3 rounded-[10px] text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50';

export const HouseholdDetailDrawer: React.FC<HouseholdDetailDrawerProps> = ({ survey, onClose, onPreviewDocument, onReviewed }) => {
  const { surveys, documents, currentUser, deleteSurvey, notify, logAudit } = useAppStore();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localPreview, setLocalPreview] = useState<HouseholdDocument | null>(null);

  // Always show the freshest copy (review decisions update the store).
  const live = survey ? surveys.find((s) => s.id === survey.id) ?? survey : null;
  const docs = useMemo(
    () => (live ? documents.filter((d) => d.householdId === live.householdId) : []),
    [documents, live]
  );

  // Reset per survey + write one "viewed" audit entry per open.
  const loggedFor = useRef<string | null>(null);
  const surveyId = survey?.id ?? null;
  useEffect(() => {
    setTab('overview');
    setDecision(null);
    setConfirmDelete(false);
    setLocalPreview(null);
    if (!survey) {
      loggedFor.current = null;
      return;
    }
    if (loggedFor.current === survey.id) return;
    loggedFor.current = survey.id;
    logAudit('view_survey', 'survey', survey.id, `Viewed ${surveyLabel(survey)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId]);

  if (!live) return null;

  const role = currentUser.role;
  const decisions = decisionsFor(role, live.status);
  const canDelete = isAdminRole(role);
  const stats = answerStats(live);

  const handlePrint = () => {
    logAudit('print_survey', 'survey', live.id, `Printed ${surveyLabel(live)}`);
    window.print();
  };

  const handleDownloadCasePdf = () => {
    const blob = buildHouseholdCaseFilePdfBlob({
      survey: live,
      documents: docs,
      peerSurveys: surveys,
      viewerRole: currentUser.role,
    });
    const file = `${live.surveyCode || live.householdId}-case-file.pdf`;
    triggerFileDownload(file, blob, 'application/pdf');
    logAudit('export_case_pdf', 'survey', live.id, `Downloaded Household Case File PDF for ${surveyLabel(live)}`);
  };

  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        wide
        dismissDisabled={!!decision || confirmDelete || !!localPreview}
        title={`${surveyLabel(live)} — ${live.profile.headName || 'Household'}`}
        subtitle={
          <>
            {live.clusterName} · {live.volunteerName} · {live.profile.surveyDate ? shortDate(live.profile.surveyDate) : '—'}
          </>
        }
        headerBadge={<StatusBadge status={live.status} size="md" />}
        headerActions={
          <button
            type="button"
            onClick={handlePrint}
            title="Print survey"
            aria-label="Print survey"
            className="w-9 h-9 rounded-[10px] border border-[#E7E2D4] flex items-center justify-center text-[#5C5547] hover:bg-[#EFECE2] hover:text-[#181611] transition-colors"
          >
            <Printer className="w-[18px] h-[18px]" />
          </button>
        }
        subheader={<SurveyDetailTabs survey={live} docs={docs} tab={tab} onTab={setTab} />}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-[#5C5547] inline-flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4 text-[#726C5D]" />
              Revision {live.revision} · {stats.answered}/{stats.total} answered
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className={`${btnBase} border border-[#F5D2CF] bg-white text-[#C93B32] hover:bg-[#FDECEA]`}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadCasePdf}
                className="min-h-[38px] px-3 rounded-[9px] border border-[#DFD9C8] bg-white hover:bg-[#EFECE2] text-[13px] font-semibold text-[#181611] inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-[#8C6200]" />
                Case PDF
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className={`${btnBase} border border-[#E7E2D4] bg-white text-[#181611] hover:bg-[#EFECE2]`}
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              {decisions.includes('REJECT') && (
                <button
                  type="button"
                  onClick={() => setDecision('REJECT')}
                  className={`${btnBase} border border-[#F5D2CF] bg-white text-[#B42318] hover:bg-[#FDECEA]`}
                >
                  <CircleX className="w-4 h-4" />
                  Reject
                </button>
              )}
              {decisions.includes('RETURN') && (
                <button
                  type="button"
                  onClick={() => setDecision('RETURN')}
                  className={`${btnBase} border border-[#F6DCC0] bg-[#FFF7EE] text-[#9A5B00] hover:bg-[#FDEBD6]`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Return
                </button>
              )}
              {decisions.includes('APPROVE') && (
                <button
                  type="button"
                  onClick={() => setDecision('APPROVE')}
                  className={`${btnBase} bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611]`}
                >
                  <CircleCheck className="w-4 h-4" />
                  Approve
                </button>
              )}
            </div>
          </div>
        }
      >
        <SurveyDetailBody
          survey={live}
          docs={docs}
          tab={tab}
          onTab={setTab}
          onPreviewDocument={(d) => (onPreviewDocument ? onPreviewDocument(d) : setLocalPreview(d))}
        />
      </DetailDrawer>

      {/* Used only when the parent does not provide its own previewer. */}
      {!onPreviewDocument && <DocumentPreview doc={localPreview} onClose={() => setLocalPreview(null)} />}

      <ReviewDecisionDialog
        survey={decision ? live : null}
        decision={decision}
        onCancel={() => setDecision(null)}
        onDone={(saved) => {
          setDecision(null);
          onReviewed?.(saved);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete survey"
        description={
          <>
            Permanently delete <strong className="text-[#181611]">{surveyLabel(live)}</strong>
            {live.profile.headName ? ` (${live.profile.headName})` : ''}, its answers, review history and {docs.length} document
            {docs.length === 1 ? '' : 's'}. This cannot be undone.
          </>
        }
        variant="danger"
        confirmLabel="Delete survey"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteSurvey(live.id);
          notify(`${surveyLabel(live)} deleted.`);
          setConfirmDelete(false);
          onClose();
        }}
      />

      {createPortal(<PrintableSurvey survey={live} docs={docs} printedBy={currentUser.name} role={currentUser.role} />, document.body)}
    </>
  );
};

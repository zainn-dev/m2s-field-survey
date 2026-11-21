import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudOff,
  Info,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { VolunteerLayout } from '../../components/layout/VolunteerLayout';
import { useAppStore } from '../../store/appStore';
import { CONSENT_PROTOCOL, QUESTIONS } from '../../data/questionnaire';
import type { HouseholdProfile, Language, QualityIssue, QuestionAnswer, QuestionDef, SurveyQualityReport, SurveyRecord } from '../../types/survey';
import { defaultQualityService, type IncrementalEngineResult } from '@m2s/shared/validation';
import { GpsConsentCard } from '@m2s/shared/components/GpsConsentCard';
import { captureSessionLocation, mergeSurveyGpsReading } from '@m2s/shared/utils/sessionLocation';
import { QualityReviewReturnBar, QualitySummaryCard, type QualityResolutionActionType } from '@m2s/shared/components/QualitySummaryCard';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { SurveyProgress } from '../../components/ui/SurveyProgress';
import { QuestionCard } from '../../components/ui/QuestionCard';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { HouseholdProfileSection } from '../../components/survey/HouseholdProfileSection';
import { HouseholdDocuments } from '../../components/survey/HouseholdDocuments';
import {
  countAnswered,
  EDITABLE_STATUSES,
  isAnswered,
  isRequired,
  missingRequired,
  parseDocVerifiedCodes,
  SECTION_INDEX,
  sectionIndexOfQuestion,
  sectionTitle,
  STATUS_TEXT,
  WIZARD_SECTIONS,
  type WizardSection,
} from '../../components/survey/surveyModel';

const AUTOSAVE_MS = 2500;

/* ================================================================== */
/* Route entry: resolve the record, then mount the wizard keyed by id  */
/* ================================================================== */

export const VolunteerSurveyWizard: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { surveys, newSurveyDraft } = useAppStore();

  // A new draft is created once per visit to /new and kept until the route carries its id.
  const draftRef = useRef<SurveyRecord | null>(null);
  if (id) draftRef.current = null;
  else if (!draftRef.current) draftRef.current = newSurveyDraft();

  const initial = id ? surveys.find((s) => s.id === id) : draftRef.current;

  if (!initial) {
    return (
      <VolunteerLayout title="Survey" onBack={() => navigate('/volunteer/surveys')} hideBottomNav>
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <EmptyState
            title="Survey not found"
            description="It may have been deleted, or it belongs to another volunteer."
            action={
              <button
                type="button"
                onClick={() => navigate('/volunteer/surveys')}
                className="h-11 px-5 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[14px] font-semibold"
              >
                Back to my surveys
              </button>
            }
          />
        </div>
      </VolunteerLayout>
    );
  }
  return <SurveyWizard key={initial.id} initial={initial} />;
};

/* ================================================================== */
/* Wizard                                                              */
/* ================================================================== */

const SurveyWizard: React.FC<{ initial: SurveyRecord }> = ({ initial }) => {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const {
    surveys,
    documents,
    clusters,
    currentUser,
    language,
    setLanguage,
    saveSurvey,
    submitSurvey,
    isPendingSync,
    notify,
    study,
    docCategories,
    recordQualityAction,
    overrideQualityIssues,
    qualityPolicy,
  } = useAppStore();

  /* ---------- record state (ref mirrors state so chained saves always see the latest) ---------- */
  const [record, setRecord] = useState<SurveyRecord>(initial);
  const recordRef = useRef(initial);
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const submittingRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const editable = EDITABLE_STATUSES.includes(record.status) && record.volunteerId === currentUser.id;
  const pendingSync = isPendingSync(record.id);
  const dirty = version !== savedVersionRef.current;

  // Latest store functions / flags for async code that outlives a render.
  const live = useRef({ saveSurvey, submitSurvey, isPendingSync, editable });
  live.current = { saveSurvey, submitSurvey, isPendingSync, editable };

  const commit = useCallback((next: SurveyRecord) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  const edit = useCallback(
    (fn: (r: SurveyRecord) => SurveyRecord) => {
      if (!live.current.editable) return;
      commit(fn(recordRef.current));
      versionRef.current += 1;
      setVersion(versionRef.current);
    },
    [commit]
  );

  /** Adopt the server's copy; if the volunteer kept typing meanwhile, keep their edits and take only server metadata. */
  const applyServer = useCallback(
    (saved: SurveyRecord, forVersion: number) => {
      if (versionRef.current === forVersion) {
        commit(saved);
        return;
      }
      const cur = recordRef.current;
      commit({
        ...cur,
        revision: saved.revision,
        status: saved.status,
        surveyCode: saved.surveyCode,
        reviews: saved.reviews,
        updatedAt: saved.updatedAt,
        submittedAt: saved.submittedAt,
        profile: { ...cur.profile, surveyCode: saved.profile.surveyCode },
        qualityResolutions: saved.qualityResolutions ?? cur.qualityResolutions,
        qualityHistory: saved.qualityHistory ?? cur.qualityHistory,
        qualityOverrides: saved.qualityOverrides ?? cur.qualityOverrides,
      });
    },
    [commit]
  );

  /** Serialised save: each save waits for the previous one and always sends the latest revision. */
  const runSave = useCallback(
    (force = false): Promise<SurveyRecord> => {
      const task = chainRef.current.then(async () => {
        const forVersion = versionRef.current;
        const rawCur = recordRef.current;
        if (!live.current.editable || submittingRef.current) return rawCur;
        if (!force && forVersion === savedVersionRef.current) return rawCur;
        const startedMs = rawCur.startedAt ? Date.parse(rawCur.startedAt) : Date.parse(rawCur.createdAt);
        const elapsed = Number.isFinite(startedMs) ? Math.max(1, Math.round((Date.now() - startedMs) / 1000)) : rawCur.durationSec;
        const cur: SurveyRecord = { ...rawCur, durationSec: elapsed ? Math.max(rawCur.durationSec ?? 0, elapsed) : rawCur.durationSec };
        setSaving(true);
        setSaveError(false);
        try {
          const saved = await live.current.saveSurvey(cur);
          applyServer(saved, forVersion);
          savedVersionRef.current = Math.max(savedVersionRef.current, forVersion);
          setVersion((v) => v); // re-render so "dirty" is recomputed
          setLastSavedAt(new Date());
          return saved;
        } catch (e) {
          setSaveError(true);
          throw e;
        } finally {
          setSaving(false);
        }
      });
      chainRef.current = task.catch(() => undefined);
      return task;
    },
    [applyServer]
  );
  const runSaveRef = useRef(runSave);
  runSaveRef.current = runSave;

  /* ---------- autosave ---------- */
  useEffect(() => {
    if (!editable || version === savedVersionRef.current) return undefined;
    // Never create the server record before consent has been recorded.
    if (record.revision === 0 && !record.consentGiven && !pendingSync) return undefined;
    const t = window.setTimeout(() => {
      runSave().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [version, editable, record.revision, record.consentGiven, pendingSync, runSave]);

  // Flush unsaved edits when leaving the wizard; warn on tab close.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (versionRef.current !== savedVersionRef.current && live.current.editable) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      const r = recordRef.current;
      if (versionRef.current !== savedVersionRef.current && live.current.editable && (r.consentGiven || r.revision > 0)) {
        runSaveRef.current().catch(() => undefined);
      }
    };
  }, []);

  // Keep the URL pointing at this survey once it exists, so a reload reopens it.
  useEffect(() => {
    if (!routeId && (record.revision > 0 || pendingSync)) navigate(`/volunteer/surveys/${record.id}`, { replace: true });
  }, [routeId, record.revision, record.id, pendingSync, navigate]);

  // Automatically acquire GPS coordinates on opening an editable survey unless respondent opted out.
  useEffect(() => {
    if (!editable || record.gpsConsent === false || record.gpsLat != null) return undefined;
    let cancelled = false;
    captureSessionLocation(undefined, record.clusterName || record.profile.clusterName).then((res) => {
      // Only a fresh fix describes this household; a stale cached one (GPS failed) would misplace it.
      if (cancelled || !live.current.editable || !res.reading || res.state !== 'active') return;
      const reading = res.reading;
      edit((r) => mergeSurveyGpsReading(r, reading));
    });
    return () => {
      cancelled = true;
    };
  }, [record.id, editable, edit]);

  // Pick up newer copies from the store: offline queue synced, admin returned/approved, etc.
  const storeCopy = surveys.find((s) => s.id === record.id);
  useEffect(() => {
    if (!storeCopy || submittingRef.current) return;
    const cur = recordRef.current;
    const isDirty = versionRef.current !== savedVersionRef.current;
    if (storeCopy.revision > cur.revision) {
      if (isDirty) applyServer(storeCopy, -1);
      else commit(storeCopy);
    } else if (
      storeCopy.revision === cur.revision &&
      (storeCopy.status !== cur.status ||
        (storeCopy.surveyCode && storeCopy.surveyCode !== cur.surveyCode) ||
        (storeCopy.qualityHistory?.length ?? 0) !== (cur.qualityHistory?.length ?? 0) ||
        (storeCopy.qualityOverrides?.length ?? 0) !== (cur.qualityOverrides?.length ?? 0))
    ) {
      commit({
        ...cur,
        status: storeCopy.status,
        surveyCode: storeCopy.surveyCode || cur.surveyCode,
        reviews: storeCopy.reviews,
        qualityResolutions: storeCopy.qualityResolutions,
        qualityHistory: storeCopy.qualityHistory,
        qualityOverrides: storeCopy.qualityOverrides,
      });
    }
  }, [storeCopy, applyServer, commit]);

  /* ---------- editing helpers ---------- */
  const setField = useCallback(
    <K extends keyof HouseholdProfile>(key: K, value: HouseholdProfile[K]) =>
      edit((r) => {
        const profile = { ...r.profile, [key]: value };
        return { ...r, profile, clusterId: profile.clusterId, clusterName: profile.clusterName };
      }),
    [edit]
  );
  const setFields = useCallback(
    (patch: Partial<HouseholdProfile>) =>
      edit((r) => {
        const profile = { ...r.profile, ...patch };
        const nextCluster = patch.clusterId ? clusters.find((c) => c.id === patch.clusterId) : undefined;
        return {
          ...r,
          profile,
          clusterId: profile.clusterId,
          clusterName: nextCluster?.name ?? profile.clusterName,
        };
      }),
    [edit, clusters]
  );
  const setAnswer = useCallback((a: QuestionAnswer) => edit((r) => ({ ...r, answers: { ...r.answers, [a.questionId]: a } })), [edit]);
  const setConsent = useCallback((v: boolean) => edit((r) => ({ ...r, consentGiven: v })), [edit]);

  /* ---------- navigation between sections ---------- */
  const [sectionIdx, setSectionIdx] = useState(() => (initial.consentGiven ? SECTION_INDEX.profile : SECTION_INDEX.consent));
  const [revealMissing, setRevealMissing] = useState<Set<number>>(() => new Set());
  const [warnedAt, setWarnedAt] = useState<number | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeReviewIssue, setActiveReviewIssue] = useState<QualityIssue | null>(null);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const section = WIZARD_SECTIONS[sectionIdx];

  useEffect(() => {
    if (scrollTarget) {
      const el = document.getElementById(scrollTarget);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setScrollTarget(null);
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [sectionIdx, scrollTarget]);

  const goTo = useCallback((idx: number, target?: string) => {
    setWarnedAt(null);
    if (target) setRevealMissing((s) => new Set(s).add(idx));
    setSectionIdx(Math.max(0, Math.min(WIZARD_SECTIONS.length - 1, idx)));
    setScrollTarget(target ?? null);
  }, []);

  /* ---------- derived ---------- */
  const answeredCount = useMemo(() => countAnswered(record.answers), [record.answers]);
  const householdDocs = useMemo(() => documents.filter((d) => d.householdId === record.householdId), [documents, record.householdId]);

  const sectionMissing = (s: WizardSection): number => {
    if (s.kind === 'consent') return record.consentGiven ? 0 : 1;
    if (s.kind === 'profile') return record.profile.headName.trim() && record.profile.clusterId ? 0 : 1;
    if (s.kind === 'questions') return missingRequired(record.answers, s.questions).length;
    if (s.kind === 'documents') return docsBlocker ? 1 : 0;
    return 0;
  };

  const requiredCats = study.requireDocumentsForSubmission
    ? docCategories.filter((c) => c.enabled && c.requiredForSubmission && !householdDocs.some((d) => d.categoryId === c.id))
    : [];
  const docsBlocker = study.requireDocumentsForSubmission
    ? householdDocs.length === 0
      ? 'Attach at least one household document.'
      : requiredCats.length > 0
        ? `Still required: ${requiredCats.map((c) => c.label).join(', ')}.`
        : ''
    : '';

  const blockers = useMemo(() => {
    const list: { text: string; section: number; target?: string }[] = [];
    if (!record.consentGiven) list.push({ text: 'Informed consent has not been recorded.', section: SECTION_INDEX.consent, target: 'consent-box' });
    if (!record.profile.headName.trim())
      list.push({ text: 'Head of household name (B4) is missing.', section: SECTION_INDEX.profile, target: 'field-headName' });
    if (!record.profile.clusterId) list.push({ text: 'Village cluster (B2) is not selected.', section: SECTION_INDEX.profile });
    if (docsBlocker) list.push({ text: docsBlocker, section: SECTION_INDEX.documents });
    return list;
  }, [record.consentGiven, record.profile.headName, record.profile.clusterId, docsBlocker]);

  const requiredDocCategoryIds = useMemo(
    () => (study.requireDocumentsForSubmission ? docCategories.filter((c) => c.enabled && c.requiredForSubmission).map((c) => c.id) : []),
    [study.requireDocumentsForSubmission, docCategories]
  );

  const missingAll = useMemo(() => missingRequired(record.answers), [record.answers]);
  const surveyForQuality = useMemo(
    () => (lastSavedAt ? { ...record, updatedAt: lastSavedAt.toISOString() } : record),
    [record, lastSavedAt]
  );
  const prevQualityRef = useRef<{
    answers: SurveyRecord['answers'];
    profile: SurveyRecord['profile'];
    documents: typeof documents;
    policy: typeof qualityPolicy;
    requiredDocCategoryIds: string[];
    engineResult: IncrementalEngineResult;
  } | null>(null);

  const qualityEval = useMemo(() => {
    const startedMs = record.startedAt ? Date.parse(record.startedAt) : Date.parse(record.createdAt);
    const elapsedSec = Number.isFinite(startedMs) ? Math.max(1, Math.round((Date.now() - startedMs) / 1000)) : record.durationSec;
    const prev = prevQualityRef.current;
    let changedKeys: string[] = ['*'];
    let prevResult: IncrementalEngineResult | null = null;
    if (
      prev &&
      prev.documents === documents &&
      prev.policy === qualityPolicy &&
      prev.requiredDocCategoryIds === requiredDocCategoryIds &&
      prev.profile === record.profile
    ) {
      const diffs: string[] = [];
      const keys = new Set([...Object.keys(prev.answers), ...Object.keys(record.answers)]);
      for (const k of keys) {
        // Rules register either the bare question id or the "answers.*" wildcard.
        if (prev.answers[k] !== record.answers[k]) diffs.push(k, `answers.${k}`);
      }
      changedKeys = diffs;
      prevResult = prev.engineResult;
    }
    return defaultQualityService.evaluateIncremental(
      {
        survey: surveyForQuality,
        documents,
        peerSurveys: surveys,
        elapsedSec,
        requiredDocCategoryIds,
        policy: qualityPolicy,
      },
      changedKeys,
      prevResult
    );
  }, [surveyForQuality, record.startedAt, record.createdAt, record.durationSec, record.answers, record.profile, documents, surveys, requiredDocCategoryIds, qualityPolicy]);

  useEffect(() => {
    prevQualityRef.current = {
      answers: record.answers,
      profile: record.profile,
      documents,
      policy: qualityPolicy,
      requiredDocCategoryIds,
      engineResult: qualityEval.engineResult,
    };
  }, [record.answers, record.profile, documents, qualityPolicy, requiredDocCategoryIds, qualityEval.engineResult]);

  const qualityReport = qualityEval.report;
  const canSubmit = editable && blockers.length === 0 && missingAll.length === 0 && (qualityReport.canSubmit ?? !qualityReport.hasBlockingErrors);
  const canSupervisorAct = ['SUPER_ADMIN', 'SURVEY_ADMIN', 'SUPERVISOR', 'REVIEWER'].includes(currentUser.role);

  const issuesByQuestion = useMemo(() => {
    const map: Record<string, QualityIssue[]> = {};
    for (const issue of [...qualityReport.errors, ...qualityReport.warnings]) {
      const qIds = issue.relevantQuestionIds?.length
        ? issue.relevantQuestionIds
        : issue.questionId
          ? [issue.questionId]
          : [];
      for (const qId of qIds) {
        (map[qId] ??= []).push(issue);
      }
    }
    if (activeReviewIssue && activeReviewIssue.severity !== 'error' && activeReviewIssue.severity !== 'warning') {
      const qIds = activeReviewIssue.relevantQuestionIds?.length
        ? activeReviewIssue.relevantQuestionIds
        : activeReviewIssue.questionId
          ? [activeReviewIssue.questionId]
          : [];
      for (const qId of qIds) {
        map[qId] = [...(map[qId] ?? []), activeReviewIssue];
      }
    }
    return map;
  }, [qualityReport.errors, qualityReport.warnings, activeReviewIssue]);

  const liveActiveIssue = useMemo(() => {
    if (!activeReviewIssue) return null;
    const key = activeReviewIssue.ruleId || activeReviewIssue.id;
    return qualityReport.issues.find((i) => (i.ruleId || i.id) === key) ?? activeReviewIssue;
  }, [activeReviewIssue, qualityReport.issues]);

  const handleJumpFromQuality = useCallback(
    (sectionKey?: string, questionId?: string, issue?: QualityIssue) => {
      if (issue) {
        setActiveReviewIssue(issue);
        if (editable && (!issue.resolutionStatus || issue.resolutionStatus === 'OPEN')) {
          recordQualityAction(recordRef.current, issue, 'UNDER_REVIEW')
            .then((updated) => {
              const cur = recordRef.current;
              if (cur.id === updated.id) {
                commit({
                  ...cur,
                  qualityResolutions: updated.qualityResolutions ?? cur.qualityResolutions,
                  qualityHistory: updated.qualityHistory ?? cur.qualityHistory,
                });
              }
            })
            .catch(() => undefined);
        }
      } else {
        setActiveReviewIssue(null);
      }
      if (questionId) {
        setFocusedQuestionId(questionId);
        goTo(sectionIndexOfQuestion(questionId), `q-${questionId}`);
        return;
      }
      setFocusedQuestionId(null);
      if (sectionKey) {
        const idx = WIZARD_SECTIONS.findIndex((s) => s.key === sectionKey);
        if (idx >= 0) goTo(idx);
      }
    },
    [commit, editable, goTo, recordQualityAction]
  );

  const handleRecordQualityAction = useCallback(
    async (issue: QualityIssue, action: QualityResolutionActionType, note?: string) => {
      const updated = await recordQualityAction(recordRef.current, issue, action, note);
      const cur = recordRef.current;
      if (cur.id === updated.id) {
        commit({
          ...cur,
          qualityResolutions: updated.qualityResolutions ?? cur.qualityResolutions,
          qualityHistory: updated.qualityHistory ?? cur.qualityHistory,
        });
      }
      notify('Quality verification saved.');
    },
    [commit, notify, recordQualityAction]
  );

  const handleOverrideIssue = useCallback(
    async (issue: QualityIssue, reason: string) => {
      const ruleKey = issue.ruleId || issue.id;
      const updated = await overrideQualityIssues(recordRef.current.id, [ruleKey], reason);
      const cur = recordRef.current;
      if (cur.id === updated.id) {
        commit({
          ...cur,
          qualityResolutions: updated.qualityResolutions ?? cur.qualityResolutions,
          qualityHistory: updated.qualityHistory ?? cur.qualityHistory,
          qualityOverrides: updated.qualityOverrides ?? cur.qualityOverrides,
        });
      }
      notify('Supervisor override recorded.');
    },
    [commit, notify, overrideQualityIssues]
  );

  /* ---------- actions ---------- */
  const onNext = () => {
    if (sectionIdx === SECTION_INDEX.consent && editable && !record.consentGiven) {
      setWarnedAt(sectionIdx);
      setScrollTarget('consent-box');
      return;
    }
    const missing = editable ? sectionMissing(section) : 0;
    if (missing > 0 && warnedAt !== sectionIdx && section.kind !== 'documents') {
      // First tap: show what is missing. A second tap continues anyway (drafts may be incomplete).
      setWarnedAt(sectionIdx);
      setRevealMissing((s) => new Set(s).add(sectionIdx));
      setScrollTarget(firstMissingTarget(section));
      return;
    }
    goTo(sectionIdx + 1);
  };

  const firstMissingTarget = (s: WizardSection): string | null => {
    if (s.kind === 'profile') return record.profile.headName.trim() ? 'b2-cluster' : 'field-headName';
    if (s.kind === 'questions') {
      const q = missingRequired(record.answers, s.questions)[0];
      return q ? `q-${q.id}` : null;
    }
    if (s.kind === 'consent') return 'consent-box';
    return null;
  };

  const saveDraft = async () => {
    try {
      const saved = await runSave(true);
      notify(isPendingSync(saved.id) || saved.revision === 0 ? 'Saved on device. It will sync when you are back online.' : 'Draft saved.');
    } catch {
      /* store already showed the error */
    }
  };

  const doSubmit = async () => {
    submittingRef.current = true;
    try {
      const task = chainRef.current.then(() => {
        const cur = recordRef.current;
        const startedMs = cur.startedAt ? Date.parse(cur.startedAt) : Date.parse(cur.createdAt);
        const elapsed = Number.isFinite(startedMs) ? Math.max(1, Math.round((Date.now() - startedMs) / 1000)) : cur.durationSec;
        return live.current.submitSurvey({ ...cur, durationSec: elapsed ? Math.max(cur.durationSec ?? 0, elapsed) : cur.durationSec });
      });
      chainRef.current = task.catch(() => undefined);
      const saved = await task;
      savedVersionRef.current = versionRef.current;
      commit(saved);
      notify(
        saved.status === 'SUBMITTED'
          ? `Survey ${saved.surveyCode} submitted for review.`
          : 'Saved on device. The survey will be submitted when you are back online.'
      );
      navigate('/volunteer/surveys');
    } catch (e) {
      submittingRef.current = false;
      throw e;
    }
  };

  /** Uploads need the household to exist on the server (or be queued) first. */
  const ensureHousehold = async () => {
    const r = recordRef.current;
    if (r.revision === 0 && !live.current.isPendingSync(r.id)) await runSave(true);
  };

  /* ---------- render ---------- */
  const hi = language === 'hi';
  const title = record.surveyCode || 'New survey';
  const missingHere = section.kind === 'questions' ? missingRequired(record.answers, section.questions) : [];
  const showMissingHere = revealMissing.has(sectionIdx);

  const saveIndicator = !editable ? null : saving ? (
    <span className="inline-flex items-center gap-1 text-[#5C5547]">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
    </span>
  ) : saveError ? (
    <button type="button" onClick={saveDraft} className="inline-flex items-center gap-1 font-semibold text-[#C93B32]">
      <RotateCcw className="w-3.5 h-3.5" /> Not saved · retry
    </button>
  ) : dirty ? (
    <span className="text-[#726C5D]">Unsaved changes</span>
  ) : pendingSync ? (
    <span className="inline-flex items-center gap-1 font-medium text-[#9A6800]">
      <CloudOff className="w-3.5 h-3.5" /> Saved on device, will sync
    </span>
  ) : record.revision > 0 ? (
    <span className="inline-flex items-center gap-1 font-medium text-[#8C6200]">
      <CheckCircle2 className="w-3.5 h-3.5" />
      Saved{lastSavedAt ? ` ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
    </span>
  ) : (
    <span className="text-[#726C5D]">Not saved yet</span>
  );

  const isLast = sectionIdx === WIZARD_SECTIONS.length - 1;

  return (
    <VolunteerLayout
      title={title}
      onBack={() => navigate('/volunteer/surveys')}
      hideBottomNav
      actions={<LanguageToggle language={language} onChange={setLanguage} compact />}
    >
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-32 space-y-4">
        <StatusBanner record={record} editable={editable} pendingSync={pendingSync} isOwner={record.volunteerId === currentUser.id} />

        <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 space-y-3">
          <SurveyProgress
            sectionNumber={sectionIdx + 1}
            sectionCount={WIZARD_SECTIONS.length}
            sectionName={sectionTitle(section, language)}
            answeredCount={answeredCount}
            totalQuestions={QUESTIONS.length}
            status={saveIndicator}
          />
          <SectionNav current={sectionIdx} onPick={(i) => goTo(i)} missingFor={(s) => (editable ? sectionMissing(s) : 0)} language={language} />
        </div>

        {section.kind === 'questions' && editable && missingHere.length > 0 && (showMissingHere || warnedAt === sectionIdx) && (
          <div className="rounded-[14px] bg-[#FFF5E0] border border-[#F6E19C] px-3.5 py-3 flex items-center justify-between gap-3">
            <p className="text-[13px] text-[#7A5600]">
              <strong>{missingHere.length}</strong> required {missingHere.length === 1 ? 'question is' : 'questions are'} unanswered here.
              {warnedAt === sectionIdx && ' Tap Next again to continue anyway.'}
            </p>
            <button
              type="button"
              onClick={() => setScrollTarget(`q-${missingHere[0].id}`)}
              className="shrink-0 h-9 px-3 rounded-[10px] bg-white border border-[#E9CF83] text-[12.5px] font-semibold text-[#7A5600] hover:bg-[#FFF9EC]"
            >
              Jump to first
            </button>
          </div>
        )}

        {liveActiveIssue && section.kind !== 'review' && (
          <QualityReviewReturnBar
            issue={liveActiveIssue}
            activeQuestionId={focusedQuestionId}
            onJumpToQuestion={(qId) => handleJumpFromQuality('questions', qId, liveActiveIssue)}
            onReturnToReview={() => {
              setActiveReviewIssue(null);
              setFocusedQuestionId(null);
              goTo(SECTION_INDEX.review);
            }}
          />
        )}

        <fieldset disabled={!editable} className="min-w-0 space-y-4">
          {section.kind === 'consent' && (
            <ConsentSection
              consent={record.consentGiven}
              onChange={setConsent}
              docPhotoConsent={Boolean(record.profile.docPhotoConsent)}
              onDocPhotoChange={(v) => setField('docPhotoConsent', v)}
              language={language}
              surveyCode={record.surveyCode}
              warn={warnedAt === sectionIdx && !record.consentGiven}
            />
          )}

          {section.kind === 'profile' && (
            <>
              {warnedAt === sectionIdx && sectionMissing(section) > 0 && (
                <p className="rounded-[14px] bg-[#FFF5E0] border border-[#F6E19C] px-3.5 py-3 text-[13px] text-[#7A5600]">
                  The head of household name and village cluster are needed before submission. Tap Next again to continue anyway.
                </p>
              )}
              <HouseholdProfileSection
                profile={record.profile}
                setField={setField}
                setFields={setFields}
                language={language}
                surveyCode={record.surveyCode}
                clusters={clusters}
                showErrors={showMissingHere}
              />
              <GpsConsentCard
                record={record}
                language={language}
                disabled={!editable}
                onUpdate={(gpsPatch) => edit((r) => ({ ...r, ...gpsPatch }))}
              />
            </>
          )}

          {section.kind === 'questions' &&
            section.questions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                language={language}
                answer={record.answers[q.id]}
                onChange={setAnswer}
                disabled={!editable}
                required={isRequired(q)}
                showMissing={editable && showMissingHere && isRequired(q) && !isAnswered(q, record.answers[q.id])}
                contextualHint={contextualHint(q, record, language)}
                highlightIssues={issuesByQuestion[q.id]}
                isFocused={focusedQuestionId === q.id}
              />
            ))}
        </fieldset>

        {section.kind === 'documents' && (
          <div className="space-y-3">
            <div className="rounded-[14px] bg-white border border-[#E7E2D4] px-3.5 py-3 flex items-start gap-2.5 text-[13px] text-[#5C5547]">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-[#8C6200]" />
              <p>
                Photograph ID and land documents only with the household&apos;s consent. For Aadhaar, record the last 4 digits only.
                {study.requireDocumentsForSubmission
                  ? ' At least one document is required before this survey can be submitted.'
                  : ' Documents are optional for submission.'}{' '}
                Documents saved offline upload automatically once the survey syncs.
              </p>
            </div>
            {docsBlocker && editable && (
              <p className="rounded-[14px] bg-[#FFF5E0] border border-[#F6E19C] px-3.5 py-3 text-[13px] text-[#7A5600]">{docsBlocker}</p>
            )}
            <HouseholdDocuments
              householdId={record.householdId}
              language={language}
              canUpload={editable}
              beforeUpload={ensureHousehold}
              b3Codes={parseDocVerifiedCodes(record.profile.docVerifiedCode)}
              defaultLast4={record.profile.idLast4}
            />
          </div>
        )}

        {section.kind === 'review' && (
          <ReviewSection
            record={record}
            language={language}
            editable={editable}
            answeredCount={answeredCount}
            docCount={householdDocs.length}
            blockers={blockers}
            missing={missingAll}
            qualityReport={qualityReport}
            onGo={goTo}
            onJumpFromQuality={handleJumpFromQuality}
            onRecordAction={editable ? handleRecordQualityAction : undefined}
            onOverrideIssue={canSupervisorAct ? handleOverrideIssue : undefined}
            canSupervisorAct={canSupervisorAct}
            canSubmit={canSubmit}
            onSubmit={() => setConfirmOpen(true)}
            documentsSection={
              <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#181611] inline-flex items-center gap-2">
                    <Camera className="w-4 h-4 text-[#8C6200]" />
                    {language === 'hi' ? 'दस्तावेज़ फ़ोटो और अपलोड' : 'Document Photos & Upload'}
                  </h2>
                  <p className="text-[12.5px] text-[#5C5547] mt-0.5">
                    {language === 'hi'
                      ? 'जमा करने से पहले यहीं से दस्तावेज़ की फ़ोटो लेकर अपलोड करें।'
                      : 'Snap & upload household documents right here before submitting.'}
                  </p>
                </div>
                <HouseholdDocuments
                  householdId={record.householdId}
                  language={language}
                  canUpload={editable}
                  beforeUpload={ensureHousehold}
                  b3Codes={parseDocVerifiedCodes(record.profile.docVerifiedCode)}
                  defaultLast4={record.profile.idLast4}
                />
              </section>
            }
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur border-t border-[#E7E2D4] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto w-full max-w-2xl px-3 sm:px-4 py-2.5 flex items-center gap-2">
          <button
            type="button"
            disabled={sectionIdx === 0}
            onClick={() => goTo(sectionIdx - 1)}
            className="h-11 px-3 rounded-[10px] border border-[#E7E2D4] bg-white text-[13.5px] font-semibold text-[#181611] hover:bg-[#FAF8F2] disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Back</span>
          </button>
          {editable && (
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="h-11 px-3 rounded-[10px] border border-[#D9AE00]/40 bg-white text-[13.5px] font-semibold text-[#8C6200] hover:bg-[#FFF8D6] disabled:opacity-60 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
              <span>Save draft</span>
            </button>
          )}
          <div className="flex-1 min-w-0" />
          {isLast ? (
            editable && (
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => setConfirmOpen(true)}
                className="h-11 px-3.5 sm:px-4 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[14px] font-semibold disabled:opacity-45 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Send className="w-4 h-4 shrink-0" />
                Submit
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="h-11 px-3.5 sm:px-4 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[14px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              Next
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={hi ? 'सर्वे जमा करें?' : 'Submit this survey?'}
        description={
          <>
            After submitting you can no longer edit it unless a reviewer returns it.
            {pendingSync || !navigator.onLine ? ' You appear to be offline: it will be submitted automatically when the connection returns.' : ''}
          </>
        }
        confirmLabel="Submit survey"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await doSubmit();
          setConfirmOpen(false);
        }}
      />
    </VolunteerLayout>
  );
};

/* ================================================================== */
/* Pieces                                                              */
/* ================================================================== */

const SectionNav: React.FC<{
  current: number;
  onPick: (i: number) => void;
  missingFor: (s: WizardSection) => number;
  language: Language;
}> = ({ current, onPick, missingFor, language }) => {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current?.children[current] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);
  return (
    <nav aria-label="Survey sections">
      <ol ref={ref} className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 [scrollbar-width:none]">
        {WIZARD_SECTIONS.map((s, i) => {
          const active = i === current;
          const missing = s.kind === 'review' ? 0 : missingFor(s);
          const done = i < current && missing === 0;
          return (
            <li key={s.kind === 'questions' ? `q-${s.sectionId}` : s.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onPick(i)}
                aria-current={active ? 'step' : undefined}
                title={sectionTitle(s, language)}
                className={`h-9 px-3 rounded-full border text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition ${
                  active
                    ? 'bg-[#181611] border-[#181611] text-[#FDC513]'
                    : 'bg-white border-[#E7E2D4] text-[#5C5547] hover:border-[#D9AE00]/50'
                }`}
              >
                {done ? (
                  <Check className={`w-3.5 h-3.5 ${active ? 'text-[#FDC513]' : 'text-[#8C6200]'}`} />
                ) : (
                  <span className={`tabular-nums ${active ? 'text-[#FDC513]/85' : 'text-[#8E8675]'}`}>{i + 1}</span>
                )}
                {s.short}
                {missing > 0 && i < current && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#FCE6B6] text-[#7A5600] text-[10.5px] font-bold inline-flex items-center justify-center">
                    {missing}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

const StatusBanner: React.FC<{ record: SurveyRecord; editable: boolean; pendingSync: boolean; isOwner: boolean }> = ({
  record,
  editable,
  pendingSync,
  isOwner,
}) => {
  const lastReview = [...record.reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (record.status === 'RETURNED') {
    return (
      <div className="rounded-[14px] bg-[#FDECEA] border border-[#F5C6C2] px-4 py-3 flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 shrink-0 text-[#C93B32] mt-0.5" />
        <div className="text-[13.5px] text-[#5E1F1A]">
          <p className="font-semibold text-[#C93B32]">Returned for correction</p>
          {lastReview?.reason ? (
            <p className="mt-0.5">
              <span className="font-medium">{lastReview.reviewerName || 'Reviewer'}:</span> “{lastReview.reason}”
            </p>
          ) : (
            <p className="mt-0.5">A reviewer asked for changes.</p>
          )}
          {editable && <p className="mt-1 text-[#7A3A35]">Fix the points above, then submit again from Review.</p>}
        </div>
      </div>
    );
  }
  if (editable && pendingSync) {
    return (
      <div className="rounded-[14px] bg-[#FFF5E0] border border-[#F6E19C] px-4 py-3 flex items-start gap-2.5 text-[13.5px] text-[#7A5600]">
        <CloudOff className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Saved on this device.</span> It will sync automatically when you are back online.
          {record.status === 'PENDING_SYNC' && ' The submission is queued; you can still make changes.'}
        </p>
      </div>
    );
  }
  if (editable) return null;

  const tone =
    record.status === 'APPROVED'
      ? 'bg-[#FFF8D6] border-[#F5E493] text-[#5C4100]'
      : record.status === 'REJECTED'
        ? 'bg-[#FDECEA] border-[#F5C6C2] text-[#5E1F1A]'
        : 'bg-[#FFF5E0] border-[#F6E19C] text-[#7A5600]';
  return (
    <div className={`rounded-[14px] border px-4 py-3 flex items-start gap-2.5 text-[13.5px] ${tone}`}>
      <Lock className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">
          {STATUS_TEXT[record.status]} · read-only
        </p>
        {!isOwner && <p className="mt-0.5">This survey belongs to {record.volunteerName || 'another volunteer'}.</p>}
        {record.status === 'REJECTED' && lastReview?.reason && <p className="mt-0.5">Reason: “{lastReview.reason}”</p>}
        {record.status === 'SUBMITTED' && isOwner && <p className="mt-0.5">A reviewer will check it. If changes are needed it will come back to you.</p>}
      </div>
    </div>
  );
};

const ConsentSection: React.FC<{
  consent: boolean;
  onChange: (v: boolean) => void;
  docPhotoConsent: boolean;
  onDocPhotoChange: (v: boolean) => void;
  language: Language;
  surveyCode: string;
  warn: boolean;
}> = ({ consent, onChange, docPhotoConsent, onDocPhotoChange, language, surveyCode, warn }) => {
  const hi = language === 'hi';
  return (
    <div className="space-y-4">
      <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold text-[#181611]">
            {hi ? CONSENT_PROTOCOL.titleHi : CONSENT_PROTOCOL.titleEn}
          </h2>
          <span className={`text-[12.5px] ${surveyCode ? 'font-mono font-semibold text-[#181611]' : 'italic text-[#726C5D]'}`}>
            {surveyCode || 'Code assigned on first save'}
          </span>
        </div>
        <div className="text-[14px] text-[#5C5547] leading-relaxed space-y-2">
          <p>{hi ? CONSENT_PROTOCOL.hi : CONSENT_PROTOCOL.en}</p>
        </div>
      </section>

      <label
        id="consent-box"
        className={`scroll-mt-28 flex items-start gap-3 rounded-[14px] border p-4 cursor-pointer ${
          consent ? 'bg-[#FFF8D6] border-[#D9AE00]/40' : warn ? 'bg-[#FDECEA] border-[#F5C6C2]' : 'bg-white border-[#E7E2D4]'
        }`}
      >
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-[#D9AE00] shrink-0"
        />
        <span className="text-[14px] text-[#181611] leading-relaxed">
          <span className="font-semibold">{hi ? CONSENT_PROTOCOL.oralConsentLabelHi : CONSENT_PROTOCOL.oralConsentLabelEn}</span>
          {warn && <span className="block mt-1 text-[13px] font-semibold text-[#C93B32]">Consent is required to continue.</span>}
        </span>
      </label>

      <label
        className={`flex items-start gap-3 rounded-[14px] border p-4 cursor-pointer ${
          docPhotoConsent ? 'bg-[#FFF8D6] border-[#D9AE00]/40' : 'bg-white border-[#E7E2D4]'
        }`}
      >
        <input
          type="checkbox"
          checked={docPhotoConsent}
          onChange={(e) => onDocPhotoChange(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-[#D9AE00] shrink-0"
        />
        <span className="text-[14px] text-[#181611] leading-relaxed font-semibold">
          {hi ? CONSENT_PROTOCOL.docPhotoConsentLabelHi : CONSENT_PROTOCOL.docPhotoConsentLabelEn}
        </span>
      </label>
    </div>
  );
};

const ReviewSection: React.FC<{
  record: SurveyRecord;
  language: Language;
  editable: boolean;
  answeredCount: number;
  docCount: number;
  blockers: { text: string; section: number; target?: string }[];
  missing: QuestionDef[];
  qualityReport: SurveyQualityReport;
  onGo: (section: number, target?: string) => void;
  onJumpFromQuality: (sectionKey?: string, questionId?: string, issue?: QualityIssue) => void;
  onRecordAction?: (issue: QualityIssue, action: QualityResolutionActionType, note?: string) => Promise<void> | void;
  onOverrideIssue?: (issue: QualityIssue, reason: string) => Promise<void> | void;
  canSupervisorAct?: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  documentsSection?: React.ReactNode;
}> = ({
  record,
  language,
  editable,
  answeredCount,
  docCount,
  blockers,
  missing,
  qualityReport,
  onGo,
  onJumpFromQuality,
  onRecordAction,
  onOverrideIssue,
  canSupervisorAct,
  canSubmit,
  onSubmit,
  documentsSection,
}) => {
  const optionalMissing = QUESTIONS.filter((q) => !isRequired(q) && !isAnswered(q, record.answers[q.id]));
  // Group unanswered required questions by wizard section.
  const groups = useMemo(() => {
    const m = new Map<number, QuestionDef[]>();
    for (const q of missing) {
      const idx = sectionIndexOfQuestion(q.id);
      m.set(idx, [...(m.get(idx) ?? []), q]);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [missing]);

  const rows: [string, React.ReactNode][] = [
    ['Survey code', record.surveyCode ? <span className="font-mono">{record.surveyCode}</span> : <em className="text-[#726C5D]">Assigned on first save</em>],
    ['Head of household', record.profile.headName || <em className="text-[#C93B32]">Missing</em>],
    ['Cluster', record.clusterName || record.profile.clusterName || '—'],
    ['Members', record.profile.totalMembers],
    ['Answered', `${answeredCount} / ${QUESTIONS.length}`],
    ['Documents', docCount],
    ['Status', STATUS_TEXT[record.status]],
  ];

  return (
    <div className="space-y-4">
      <QualitySummaryCard
        report={qualityReport}
        onJumpTo={(sectionKey, questionId, issue) => onJumpFromQuality(sectionKey, questionId, issue)}
        onRecordAction={onRecordAction}
        onOverrideIssue={onOverrideIssue}
        canVerify={editable}
        canSupervisorAct={canSupervisorAct}
        allowSupervisorOverride={Boolean(canSupervisorAct && onOverrideIssue)}
      />
      <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4">
        <h2 className="text-[17px] font-semibold text-[#181611] mb-2">Summary</h2>
        <dl className="divide-y divide-[#EFECE2]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 py-2 text-[14px]">
              <dt className="text-[#726C5D] shrink-0">{k}</dt>
              <dd className="font-medium text-[#181611] text-right min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {editable && (blockers.length > 0 || missing.length > 0) && (
        <section className="bg-white rounded-[14px] border border-[#F6E19C] p-4 space-y-3">
          <h2 className="text-[15px] font-semibold text-[#7A5600] inline-flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Complete before submitting
          </h2>
          {blockers.length > 0 && (
            <ul className="space-y-1.5">
              {blockers.map((b) => (
                <li key={b.text}>
                  <button
                    type="button"
                    onClick={() => onGo(b.section, b.target)}
                    className="w-full min-h-[44px] text-left rounded-[10px] bg-[#FFF8E6] border border-[#F6E19C] px-3 py-2 text-[13.5px] text-[#5C4300] flex items-center justify-between gap-2 hover:bg-[#FFF2D2]"
                  >
                    {b.text}
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {groups.map(([idx, qs]) => (
            <div key={idx}>
              <button
                type="button"
                onClick={() => onGo(idx, `q-${qs[0].id}`)}
                className="w-full flex items-center justify-between gap-2 text-left text-[13.5px] font-semibold text-[#181611] py-1 hover:text-[#6E4D00]"
              >
                <span>
                  {sectionTitle(WIZARD_SECTIONS[idx], language)}{' '}
                  <span className="font-normal text-[#726C5D]">· {qs.length} unanswered</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" />
              </button>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {qs.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onGo(idx, `q-${q.id}`)}
                    className="h-9 min-w-[48px] px-2.5 rounded-[10px] bg-white border border-[#E9CF83] text-[12.5px] font-bold text-[#5C4300] hover:bg-[#FDC513] hover:border-[#D9AE00] hover:text-[#181611]"
                  >
                    {q.id}
                    {q.type === 'q40' && ` (${record.answers[q.id]?.optionKeys.length ?? 0}/2)`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {editable && optionalMissing.length > 0 && (
        <p className="rounded-[14px] bg-white border border-[#E7E2D4] px-4 py-3 text-[13px] text-[#5C5547] flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-[#726C5D]" />
          <span>
            Open-ended questions {optionalMissing.map((q) => q.id).join(', ')} are empty. They are optional, but testimonies are valuable.{' '}
            <button
              type="button"
              onClick={() => onGo(sectionIndexOfQuestion(optionalMissing[0].id), `q-${optionalMissing[0].id}`)}
              className="font-semibold text-[#8C6200] hover:text-[#6E4D00]"
            >
              Add them
            </button>
          </span>
        </p>
      )}

      {documentsSection}

      {editable && (
        <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
          {canSubmit ? (
            <p className="text-[14px] text-[#5C4100] inline-flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#8C6200]" /> Everything required is complete.
            </p>
          ) : (
            <p className="text-[13.5px] text-[#5C5547]">Submit becomes available once the items above are complete. Your draft is kept meanwhile.</p>
          )}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="w-full h-12 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[15px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45"
          >
            <Send className="w-4 h-4" />
            {record.status === 'RETURNED' ? 'Resubmit survey' : 'Submit survey'}
          </button>
        </section>
      )}
    </div>
  );
};

/** Roster-aware hints that point the volunteer to the Not Applicable option. */
function contextualHint(q: QuestionDef, r: SurveyRecord, language: Language): string | undefined {
  const hi = language === 'hi';
  const p = r.profile;
  if (q.id === 'Q7' && p.age6to14 === 0)
    return hi ? 'B4 में 6–14 वर्ष के 0 बच्चे दर्ज हैं — विकल्प 5 (कोई बच्चा नहीं) चुनें।' : 'B4 shows 0 children aged 6–14, so choose option 5 (No children 6–14).';
  const under6 = (p.ageUnder1 ?? 0) + (p.age1to5 ?? p.age0to5);
  if (q.id === 'Q8' && under6 === 0)
    return hi ? 'B4 में 6 वर्ष से कम के 0 बच्चे दर्ज हैं — विकल्प 4 (लागू नहीं) चुनें।' : 'B4 shows 0 children under 6, so choose option 4 (No child under 6).';
  if (q.id === 'Q16' && p.femaleCount === 0)
    return hi ? 'B4 में महिला सदस्य 0 हैं — विकल्प 4 (लागू नहीं) चुनें।' : 'B4 shows 0 female members, so choose option 4 (No menstruating women/girls).';
  return undefined;
}

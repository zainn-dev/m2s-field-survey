import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, MapPin, Save, Send, ShieldCheck } from 'lucide-react';
import { ConfirmDialog } from '@m2s/shared/components/ConfirmDialog';
import { HouseholdProfileSection } from '@m2s/shared/components/HouseholdProfileSection';
import {
  QualityReviewReturnBar,
  QualitySummaryCard,
  type QualityResolutionActionType,
} from '@m2s/shared/components/QualitySummaryCard';
import { QuestionCard } from '@m2s/shared/components/QuestionCard';
import { StatusBadge } from '@m2s/shared/components/StatusBadge';
import { SurveyProgress } from '@m2s/shared/components/SurveyProgress';
import { CONSENT_PROTOCOL, QUESTIONS } from '@m2s/shared/data/questionnaire';
import {
  countAnswered,
  EDITABLE_STATUSES,
  parseDocVerifiedCodes,
  SECTION_INDEX,
  sectionIndexOfQuestion,
  sectionTitle,
  WIZARD_SECTIONS,
} from '@m2s/shared/survey/surveyModel';
import type { HouseholdProfile, QualityIssue, QuestionAnswer, SurveyRecord } from '@m2s/shared/types/survey';
import { defaultQualityService, type IncrementalEngineResult } from '@m2s/shared/validation';
import { captureSessionLocation, mergeSurveyGpsReading } from '@m2s/shared/utils/sessionLocation';
import { App as CapApp } from '@capacitor/app';
import { isNativeCapacitor } from '../api/http';
import { useMobileStore } from '../store/mobileStore';
import { mobileNativeGpsProvider } from '../utils/nativeGps';
import { MobileGpsCard } from '../components/MobileGpsCard';
import { MobileHouseholdDocuments } from '../components/MobileHouseholdDocuments';
import { MobileLayout } from '../components/MobileLayout';

export const VolunteerSurveyWizard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const clusterOverride = (location.state as { clusterId?: string } | null)?.clusterId;

  const {
    surveys,
    clusters,
    documents,
    docCategories,
    study,
    qualityPolicy,
    currentUser,
    language,
    newSurveyDraft,
    saveSurvey,
    submitSurvey,
    recordQualityAction,
    isPendingSync,
    notify,
  } = useMobileStore();
  const hi = language === 'hi';

  const existing = useMemo(() => (id ? surveys.find((s) => s.id === id) : undefined), [id, surveys]);
  const [draft, setDraft] = useState<SurveyRecord>(() => existing ?? newSurveyDraft(clusterOverride));
  const [stepIdx, setStepIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [activeReviewIssue, setActiveReviewIssue] = useState<QualityIssue | null>(null);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);

  const sessionStartMs = useRef<number>(Date.now());
  const baseDurationRef = useRef<number>(existing?.durationSec ?? 0);
  const prevEngineRef = useRef<IncrementalEngineResult | null>(null);
  const prevAnswersRef = useRef<SurveyRecord['answers']>(draft.answers);
  // Latest draft + an edit counter, so async saves never clobber edits typed while the request was in flight.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editSeqRef = useRef(0);
  const savingRef = useRef(false);
  const markEdited = () => {
    editSeqRef.current += 1;
    setDirty(true);
  };

  // Sync newly fetched server survey or queued quality metadata without discarding unsaved edits
  useEffect(() => {
    if (id && existing && !dirty) {
      setDraft(existing);
      baseDurationRef.current = existing.durationSec ?? 0;
      sessionStartMs.current = Date.now();
    } else if (id && existing && dirty) {
      setDraft((prev) => ({
        ...prev,
        surveyCode: prev.surveyCode || existing.surveyCode,
        qualityResolutions: existing.qualityResolutions ?? prev.qualityResolutions,
        qualityHistory: existing.qualityHistory ?? prev.qualityHistory,
        qualityOverrides: existing.qualityOverrides ?? prev.qualityOverrides,
      }));
    }
  }, [id, existing, dirty]);

  // Smooth scroll when navigating directly to a flagged question card
  useEffect(() => {
    if (!scrollTarget) return undefined;
    const t = window.setTimeout(() => {
      const el = document.getElementById(scrollTarget);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollTarget(null);
    }, 60);
    return () => window.clearTimeout(t);
  }, [stepIdx, scrollTarget]);

  const editable = EDITABLE_STATUSES.includes(draft.status);
  const currentSec = WIZARD_SECTIONS[stepIdx] ?? WIZARD_SECTIONS[0];

  const withElapsed = (rec: SurveyRecord): SurveyRecord => {
    const elapsed = Math.max(0, Math.round((Date.now() - sessionStartMs.current) / 1000));
    return {
      ...rec,
      startedAt: rec.startedAt || new Date(sessionStartMs.current).toISOString(),
      durationSec: baseDurationRef.current + elapsed,
    };
  };

  const updateRecord = (patch: Partial<SurveyRecord>) => {
    if (!editable) return;
    setDraft((prev) => ({ ...prev, ...patch, updatedAt: new Date().toISOString() }));
    markEdited();
  };

  const setProfileField = <K extends keyof HouseholdProfile>(key: K, value: HouseholdProfile[K]) => {
    if (!editable) return;
    setDraft((prev) => {
      const nextCluster = key === 'clusterId' ? clusters.find((c) => c.id === value) : undefined;
      return {
        ...prev,
        ...(key === 'clusterId'
          ? { clusterId: String(value), clusterName: nextCluster?.name ?? prev.clusterName }
          : {}),
        profile: {
          ...prev.profile,
          [key]: value,
          ...(nextCluster ? { clusterName: nextCluster.name } : {}),
        },
        updatedAt: new Date().toISOString(),
      };
    });
    markEdited();
  };

  const setProfileFields = (patch: Partial<HouseholdProfile>) => {
    if (!editable) return;
    setDraft((prev) => {
      const nextCluster = patch.clusterId ? clusters.find((c) => c.id === patch.clusterId) : undefined;
      return {
        ...prev,
        ...(patch.clusterId
          ? { clusterId: String(patch.clusterId), clusterName: nextCluster?.name ?? prev.clusterName }
          : {}),
        profile: {
          ...prev.profile,
          ...patch,
          ...(nextCluster ? { clusterName: nextCluster.name } : {}),
        },
        updatedAt: new Date().toISOString(),
      };
    });
    markEdited();
  };

  const setAnswer = (qId: string, ans: QuestionAnswer) => {
    if (!editable) return;
    setDraft((prev) => ({
      ...prev,
      answers: { ...prev.answers, [qId]: ans },
      updatedAt: new Date().toISOString(),
    }));
    markEdited();
  };

  const handleSaveDraft = async (silent = false) => {
    if (!editable || savingRef.current || submitting) return;
    savingRef.current = true;
    setSaving(true);
    const seqAtStart = editSeqRef.current;
    try {
      const saved = await saveSurvey(withElapsed(draftRef.current));
      if (editSeqRef.current === seqAtStart) {
        setDraft(saved);
        setDirty(false);
      } else {
        // Edits arrived mid-save: keep them, but adopt the server's bookkeeping so the next save is not a conflict.
        setDraft((prev) => ({
          ...prev,
          revision: saved.revision,
          surveyCode: saved.surveyCode || prev.surveyCode,
          status: saved.status,
          createdAt: saved.createdAt,
        }));
      }
      baseDurationRef.current = saved.durationSec ?? baseDurationRef.current;
      sessionStartMs.current = Date.now();
      if (!id) navigate(`/surveys/${saved.id}`, { replace: true });
      if (!silent) notify(hi ? 'ड्राफ़्ट सुरक्षित किया गया।' : 'Draft saved.', 'success');
    } catch {
      /* toast handled by store */
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const saveDraftRef = useRef(handleSaveDraft);
  saveDraftRef.current = handleSaveDraft;

  // Autosave 20 s after the draft first becomes dirty. Not re-armed on every keystroke, otherwise a volunteer
  // who keeps typing would never be autosaved.
  useEffect(() => {
    if (!editable || !dirty) return undefined;
    const t = window.setInterval(() => {
      saveDraftRef.current(true).catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(t);
  }, [dirty, editable]);

  // Save immediately when the app goes to the background (Android may kill it there).
  useEffect(() => {
    if (!editable) return undefined;
    const saveIfDirty = () => {
      if (dirtyRef.current) saveDraftRef.current(true).catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saveIfDirty();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const sub = isNativeCapacitor()
      ? CapApp.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) saveIfDirty();
        }).catch(() => null)
      : null;
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      sub?.then((h) => h?.remove()).catch(() => undefined);
    };
  }, [editable]);

  // Automatically acquire GPS coordinates on opening an editable survey unless respondent opted out.
  useEffect(() => {
    if (!editable || draft.gpsConsent === false || draft.gpsLat != null) return undefined;
    let cancelled = false;
    captureSessionLocation(mobileNativeGpsProvider, draft.clusterName || draft.profile.clusterName).then((res) => {
      // Only a fresh fix describes this household; a stale cached one (GPS failed) would misplace it.
      if (cancelled || !res.reading || res.state !== 'active') return;
      const reading = res.reading;
      setDraft((prev) => mergeSurveyGpsReading(prev, reading));
      editSeqRef.current += 1;
      if (draft.revision > 0 || draft.consentGiven) setDirty(true);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.id, editable]);

  const requiredDocCategoryIds = useMemo(
    () =>
      study.requireDocumentsForSubmission
        ? docCategories.filter((c) => c.enabled && c.requiredForSubmission).map((c) => c.id)
        : [],
    [study.requireDocumentsForSubmission, docCategories]
  );

  const qualityReport = useMemo(() => {
    const changedKeys: string[] = [];
    const prevA = prevAnswersRef.current;
    const curA = draft.answers;
    const allQ = new Set([...Object.keys(prevA), ...Object.keys(curA)]);
    for (const qId of allQ) {
      // Rules register either the bare question id or the "answers.*" wildcard.
      if (prevA[qId] !== curA[qId]) changedKeys.push(qId, `answers.${qId}`);
    }
    prevAnswersRef.current = curA;

    const evalInput = {
      survey: withElapsed(draft),
      documents: documents.filter((d) => d.householdId === draft.householdId),
      peerSurveys: surveys,
      requiredDocCategoryIds,
      policy: qualityPolicy,
    };

    if (prevEngineRef.current && changedKeys.length > 0) {
      const inc = defaultQualityService.evaluateIncremental(evalInput, changedKeys, prevEngineRef.current);
      prevEngineRef.current = inc.engineResult;
      return inc.report;
    }
    const inc = defaultQualityService.evaluateIncremental(evalInput, ['*'], null);
    prevEngineRef.current = inc.engineResult;
    return inc.report;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, surveys, documents, requiredDocCategoryIds, qualityPolicy, stepIdx]);

  const issuesByQuestion = useMemo(() => {
    const m = new Map<string, QualityIssue[]>();
    for (const issue of [...qualityReport.errors, ...qualityReport.warnings]) {
      const qIds = issue.relevantQuestionIds?.length
        ? issue.relevantQuestionIds
        : issue.questionId
          ? [issue.questionId]
          : [];
      for (const qId of qIds) {
        m.set(qId, [...(m.get(qId) ?? []), issue]);
      }
    }
    return m;
  }, [qualityReport.errors, qualityReport.warnings]);

  const jumpToTarget = (sectionKey?: string, questionId?: string, issue?: QualityIssue) => {
    setShowErrors(true);
    if (issue) {
      setActiveReviewIssue(issue);
      if (issue.resolutionStatus === 'OPEN' && editable && draft.volunteerId === currentUser.id) {
        recordQualityAction(draft, issue, 'UNDER_REVIEW')
          .then((updated) =>
            setDraft((prev) => ({
              ...prev,
              qualityResolutions: updated.qualityResolutions ?? prev.qualityResolutions,
              qualityHistory: updated.qualityHistory ?? prev.qualityHistory,
            }))
          )
          .catch(() => undefined);
      }
    }
    if (questionId) {
      setFocusedQuestionId(questionId);
      const qIdx = sectionIndexOfQuestion(questionId);
      if (qIdx >= 0) {
        setStepIdx(qIdx);
        setScrollTarget(`q-${questionId}`);
        return;
      }
    }
    if (sectionKey) {
      const idx = WIZARD_SECTIONS.findIndex((s) => s.key === sectionKey);
      if (idx >= 0) {
        setStepIdx(idx);
        setScrollTarget(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }
  };

  const handleRecordQualityAction = async (
    issue: QualityIssue,
    action: QualityResolutionActionType,
    note?: string
  ) => {
    const updated = await recordQualityAction(draft, issue, action, note);
    setDraft((prev) => ({
      ...prev,
      qualityResolutions: updated.qualityResolutions ?? prev.qualityResolutions,
      qualityHistory: updated.qualityHistory ?? prev.qualityHistory,
    }));
    notify('Quality check verification saved.', 'success');
  };

  const handleConfirmSubmit = async () => {
    setConfirmSubmit(false);
    if (!qualityReport.canSubmit) {
      setShowErrors(true);
      notify(qualityReport.submissionBlockReasons?.[0] ?? 'Resolve blocking quality issues before submitting.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await submitSurvey(withElapsed(draft));
      setDraft(saved);
      setDirty(false);
      navigate('/surveys', { replace: true });
    } catch {
      /* the store already showed the error; stay on the form */
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = countAnswered(draft.answers);

  return (
    <MobileLayout
      title={draft.surveyCode || (hi ? 'नया पारिवारिक सर्वे' : 'New Household Survey')}
      backTo="/surveys"
      showBottomNav={false}
    >
      {/* Progress & Sync Status Header */}
      <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={isPendingSync(draft.id) ? 'PENDING_SYNC' : draft.status} />
          <div className="flex items-center gap-2 text-[11.5px] text-[#5C5547]">
            {draft.gpsConsent !== false && draft.gpsLat != null && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EDF8F1] text-[#217045] px-2 py-0.5 font-semibold">
                <MapPin className="w-3 h-3" />
                GPS ±{Math.round(draft.gpsAccuracyMeters ?? 0)}m
              </span>
            )}
            {draft.durationSec != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {Math.max(1, Math.round(draft.durationSec / 60))}m
              </span>
            )}
            <span>{dirty ? 'Unsaved changes' : saving ? 'Saving…' : 'Saved'}</span>
          </div>
        </div>

        <SurveyProgress
          sectionNumber={stepIdx + 1}
          sectionCount={WIZARD_SECTIONS.length}
          sectionName={sectionTitle(currentSec, language)}
          answeredCount={answeredCount}
          totalQuestions={QUESTIONS.length}
        />

        {/* Quick Section Jumper */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {WIZARD_SECTIONS.map((sec, idx) => (
            <button
              key={sec.kind === 'questions' ? `q-${sec.sectionId}` : sec.key}
              type="button"
              onClick={() => {
                setStepIdx(idx);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`h-8 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap border transition ${
                idx === stepIdx
                  ? 'bg-[#FDC513] text-[#181611] border-[#D9AE00]'
                  : 'bg-[#FAF8F2] text-[#5C5547] border-[#DFD9C8]'
              }`}
            >
              {idx + 1}. {sec.short}
            </button>
          ))}
        </div>
      </div>

      {/* Returned Correction Banner */}
      {draft.status === 'RETURNED' && draft.reviews.length > 0 && (
        <div className="rounded-[12px] bg-[#FDE8D8] border border-[#F3B68F] p-3 text-[12.5px] text-[#7D3206]">
          <strong>Returned for correction:</strong> {draft.reviews[draft.reviews.length - 1].reason || 'Check supervisor feedback.'}
        </div>
      )}

      {/* Section Content */}
      {currentSec.kind === 'consent' && (
        <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#FFF8D6] text-[#8C6200] grid place-items-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-[16px] font-bold text-[#181611]">
                {hi ? CONSENT_PROTOCOL.titleHi : CONSENT_PROTOCOL.titleEn}
              </h2>
              <p className="text-[12.5px] text-[#5C5547] mt-1 leading-relaxed">
                {hi ? CONSENT_PROTOCOL.hi : CONSENT_PROTOCOL.en}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!editable}
            onClick={() => updateRecord({ consentGiven: !draft.consentGiven })}
            className={`w-full min-h-[52px] rounded-[12px] border px-4 py-3 flex items-center gap-3 text-left transition ${
              draft.consentGiven
                ? 'bg-[#FFF8D6] border-[#D9AE00] text-[#5C4100]'
                : 'bg-[#FAF8F2] border-[#DFD9C8] text-[#181611]'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-md border grid place-items-center shrink-0 ${
                draft.consentGiven ? 'bg-[#FDC513] border-[#D9AE00] text-[#181611]' : 'bg-white border-[#9E9683]'
              }`}
            >
              {draft.consentGiven && <Check className="w-4 h-4" strokeWidth={2.5} />}
            </span>
            <span className="text-[13.5px] font-semibold">
              {hi ? CONSENT_PROTOCOL.oralConsentLabelHi : CONSENT_PROTOCOL.oralConsentLabelEn}
            </span>
          </button>

          <button
            type="button"
            disabled={!editable}
            onClick={() => setProfileField('docPhotoConsent', !draft.profile.docPhotoConsent)}
            className={`w-full min-h-[52px] rounded-[12px] border px-4 py-3 flex items-center gap-3 text-left transition ${
              draft.profile.docPhotoConsent
                ? 'bg-[#FFF8D6] border-[#D9AE00] text-[#5C4100]'
                : 'bg-[#FAF8F2] border-[#DFD9C8] text-[#181611]'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-md border grid place-items-center shrink-0 ${
                draft.profile.docPhotoConsent ? 'bg-[#FDC513] border-[#D9AE00] text-[#181611]' : 'bg-white border-[#9E9683]'
              }`}
            >
              {draft.profile.docPhotoConsent && <Check className="w-4 h-4" strokeWidth={2.5} />}
            </span>
            <span className="text-[13.5px] font-semibold">
              {hi ? CONSENT_PROTOCOL.docPhotoConsentLabelHi : CONSENT_PROTOCOL.docPhotoConsentLabelEn}
            </span>
          </button>
        </section>
      )}

      {currentSec.kind === 'profile' && (
        <div className="space-y-4">
          <HouseholdProfileSection
            profile={draft.profile}
            setField={setProfileField}
            setFields={setProfileFields}
            language={language}
            surveyCode={draft.surveyCode}
            clusters={clusters}
            showErrors={showErrors}
          />
          <MobileGpsCard
            record={draft}
            language={language}
            disabled={!editable}
            onUpdate={(patch) => updateRecord(patch)}
          />
        </div>
      )}

      {activeReviewIssue && currentSec.kind !== 'review' && (
        <QualityReviewReturnBar
          issue={activeReviewIssue}
          activeQuestionId={focusedQuestionId}
          onJumpToQuestion={(qId) => jumpToTarget(undefined, qId, activeReviewIssue)}
          onReturnToReview={() => {
            setActiveReviewIssue(null);
            setFocusedQuestionId(null);
            setStepIdx(SECTION_INDEX.review);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {currentSec.kind === 'questions' && (
        <div className="space-y-3.5">
          {currentSec.questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              language={language}
              answer={draft.answers[q.id]}
              onChange={(ans) => setAnswer(q.id, ans)}
              disabled={!editable}
              showMissing={showErrors}
              highlightIssues={issuesByQuestion.get(q.id)}
              isFocused={focusedQuestionId === q.id}
            />
          ))}
        </div>
      )}

      {currentSec.kind === 'documents' && (
        <MobileHouseholdDocuments
          householdId={draft.householdId}
          b3Codes={parseDocVerifiedCodes(draft.profile.docVerifiedCode)}
          defaultLast4={draft.profile.idLast4}
          disabled={!editable}
        />
      )}

      {currentSec.kind === 'review' && (
        <div className="space-y-4">
          <QualitySummaryCard
            report={qualityReport}
            onJumpTo={jumpToTarget}
            onRecordAction={handleRecordQualityAction}
            canVerify={editable && draft.volunteerId === currentUser.id}
          />

          <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-2 text-[13px]">
            <h3 className="font-bold text-[#181611]">Submission Summary</h3>
            <div className="divide-y divide-[#EFECE2]">
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[#5C5547] shrink-0">Head of Household</span>
                <span className="font-semibold text-[#181611] text-right min-w-0 break-words">{draft.profile.headName || '—'}</span>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[#5C5547] shrink-0">Cluster</span>
                <span className="font-semibold text-[#181611] text-right min-w-0 break-words">{draft.clusterName || '—'}</span>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[#5C5547] shrink-0">Documents Ticked (B2)</span>
                <span className="font-semibold text-[#181611] text-right min-w-0 break-words">{draft.profile.docVerifiedLabel || '—'}</span>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[#5C5547] shrink-0">GPS Consent & Coords</span>
                <span className="font-semibold text-[#181611] text-right">
                  {draft.gpsConsent && draft.gpsLat != null
                    ? `${draft.gpsLat.toFixed(4)}, ${draft.gpsLng?.toFixed(4)}`
                    : 'Not captured'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[#5C5547] shrink-0">Documents Attached</span>
                <span className="font-semibold text-[#181611] text-right">
                  {documents.filter((d) => d.householdId === draft.householdId).length}
                </span>
              </div>
            </div>
          </div>

          <section className="space-y-2.5">
            <div className="bg-white rounded-[14px] border border-[#E7E2D4] px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[14.5px] font-bold text-[#181611]">
                  {hi ? 'दस्तावेज़ फ़ोटो खींचें / अपलोड करें' : 'Take Photo & Upload Documents'}
                </h3>
                <p className="text-[12px] text-[#5C5547] mt-0.5 leading-snug">
                  {hi
                    ? 'जमा करने से पहले यहीं कैमरे से दस्तावेज़ की फ़ोटो लेकर अपलोड करें।'
                    : 'Capture photos or pick files for household documents right before submitting.'}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-[#FFF8D6] text-[#5C4100] text-[11px] font-bold shrink-0">
                {documents.filter((d) => d.householdId === draft.householdId).length} attached
              </span>
            </div>
            <MobileHouseholdDocuments
              householdId={draft.householdId}
              b3Codes={parseDocVerifiedCodes(draft.profile.docVerifiedCode)}
              defaultLast4={draft.profile.idLast4}
              disabled={!editable}
            />
          </section>

          {editable && (
            <button
              type="button"
              disabled={submitting || !qualityReport.canSubmit}
              onClick={() => setConfirmSubmit(true)}
              className="w-full h-12 rounded-[12px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-50 text-[#181611] text-[15px] font-bold inline-flex items-center justify-center gap-2 shadow"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {!qualityReport.canSubmit
                ? `Resolve ${
                    (qualityReport.unresolvedErrors?.length ?? qualityReport.errors.length) +
                    (qualityReport.unresolvedWarnings?.length ?? 0)
                  } Policy Issue(s) to Submit`
                : hi
                  ? 'सर्वे जमा करें'
                  : 'Submit Survey for Review'}
            </button>
          )}
        </div>
      )}

      {/* Sticky Footer Navigation */}
      <div className="sticky bottom-3 z-20 bg-white/95 backdrop-blur border border-[#DFD9C8] rounded-[14px] p-2 sm:p-2.5 shadow-lg flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          disabled={stepIdx === 0}
          onClick={() => {
            setStepIdx((i) => Math.max(0, i - 1));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="h-10 px-2.5 sm:px-3 rounded-[10px] border border-[#DFD9C8] disabled:opacity-40 text-[12.5px] sm:text-[13px] font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>

        {editable && (
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSaveDraft(false)}
            className="flex-1 min-w-0 h-10 px-2 rounded-[10px] bg-[#FFF8D6] text-[#5C4100] text-[12.5px] sm:text-[13px] font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
            <span className="truncate">Save Draft</span>
          </button>
        )}

        {stepIdx < SECTION_INDEX.review ? (
          <button
            type="button"
            onClick={() => {
              setStepIdx((i) => Math.min(SECTION_INDEX.review, i + 1));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="h-10 px-3 sm:px-3.5 rounded-[10px] bg-[#181611] text-[#FDC513] text-[12.5px] sm:text-[13px] font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          !editable && <span className="flex-1 text-center text-[12px] font-semibold text-[#5C5547]">Read-only mode</span>
        )}
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit household survey?"
        description={
          qualityReport.warnings.length > 0
            ? `Survey has ${qualityReport.completenessScore}% completeness score and ${qualityReport.warnings.length} quality warning(s). Submit now?`
            : 'Once submitted, a coordinator will verify responses and attached documents.'
        }
        confirmLabel="Submit Survey"
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={handleConfirmSubmit}
      />
    </MobileLayout>
  );
};

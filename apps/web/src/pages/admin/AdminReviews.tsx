import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, Keyboard, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { SearchBar } from '../../components/ui/SearchBar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DocumentPreview } from '../../components/ui/DocumentPreview';
import { HouseholdDetailDrawer, decisionsFor } from './HouseholdDetailDrawer';
import { QualityInsightsPanel } from './QualityInsightsPanel';
import { useAppStore } from '../../store/appStore';
import { defaultQualityService, defaultQualitySummary } from '@m2s/shared/validation';
import { HouseholdDocument, ReviewDecision, SurveyRecord, SurveyStatus } from '../../types/survey';

export const AdminReviews: React.FC = () => {
  const { surveys, documents, docCategories, study, qualityPolicy, currentUser, reviewSurvey, notify } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'queue' | 'insights'>(() =>
    searchParams.get('tab') === 'insights' ? 'insights' : 'queue'
  );
  const [statusTab, setStatusTab] = useState<'ALL' | SurveyStatus>('SUBMITTED');
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyRecord | null>(null);
  const [previewDoc, setPreviewDoc] = useState<HouseholdDocument | null>(null);
  const [reviewAction, setReviewAction] = useState<{
    survey: SurveyRecord;
    decision: ReviewDecision;
  } | null>(null);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'insights') setViewMode('insights');
    else if (t === 'queue') setViewMode('queue');
  }, [searchParams]);

  const switchView = (mode: 'queue' | 'insights') => {
    setViewMode(mode);
    setSearchParams(mode === 'insights' ? { tab: 'insights' } : {}, { replace: true });
  };

  const requiredDocCategoryIds = useMemo(
    () => (study.requireDocumentsForSubmission ? docCategories.filter((c) => c.enabled && c.requiredForSubmission).map((c) => c.id) : []),
    [study.requireDocumentsForSubmission, docCategories]
  );

  const pendingEscalationCount = useMemo(
    () =>
      defaultQualitySummary.aggregatePortfolio(surveys, {
        documents,
        requiredDocCategoryIds,
        policy: qualityPolicy,
      }).pendingSupervisorQueue.length,
    [surveys, documents, requiredDocCategoryIds, qualityPolicy]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return surveys.filter((s) => {
      if (statusTab !== 'ALL' && s.status !== statusTab) return false;
      if (!q) return true;
      return (
        s.surveyCode.toLowerCase().includes(q) ||
        s.profile.headName.toLowerCase().includes(q) ||
        s.clusterName.toLowerCase().includes(q) ||
        s.volunteerName.toLowerCase().includes(q)
      );
    });
  }, [surveys, statusTab, search]);

  useEffect(() => {
    setFocusedIndex((i) => Math.max(0, Math.min(i, Math.max(0, filtered.length - 1))));
  }, [filtered.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (viewMode !== 'queue' || selectedSurvey || previewDoc || reviewAction) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      // Enter / Space on a focused button or link must activate that control, not open the queue item too.
      if ((e.key === 'Enter' || e.key === ' ') && t?.closest('button, a, [role="button"]')) return;
      if (filtered.length === 0) return;

      const cur = filtered[focusedIndex] ?? filtered[0];
      const allowed = cur ? decisionsFor(currentUser.role, cur.status) : [];
      const k = e.key.toLowerCase();

      if (e.key === 'ArrowDown' || k === 'j') {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp' || k === 'k') {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
      } else if ((e.key === 'Enter' || k === 'v') && cur) {
        e.preventDefault();
        setSelectedSurvey(cur);
      } else if (k === 'a' && cur && allowed.includes('APPROVE')) {
        e.preventDefault();
        setReviewAction({ survey: cur, decision: 'APPROVE' });
      } else if (k === 'r' && cur && allowed.includes('RETURN')) {
        e.preventDefault();
        setReviewAction({ survey: cur, decision: 'RETURN' });
      } else if (k === 'x' && cur && allowed.includes('REJECT')) {
        e.preventDefault();
        setReviewAction({ survey: cur, decision: 'REJECT' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtered, focusedIndex, selectedSurvey, previewDoc, reviewAction, currentUser.role, viewMode]);

  return (
    <AdminLayout
      title="Review & Approval Queue"
      subtitle="Verify household survey completeness, inspect uploaded documents, and approve or return submissions."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-[#E7E2D4] bg-white p-1">
          <button
            type="button"
            onClick={() => switchView('queue')}
            className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${
              viewMode === 'queue' ? 'bg-[#FDC513] text-[#181611]' : 'text-[#5C5547] hover:text-[#181611]'
            }`}
          >
            Review Queue
          </button>
          <button
            type="button"
            onClick={() => switchView('insights')}
            className={`h-8 px-3 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
              viewMode === 'insights' ? 'bg-[#FDC513] text-[#181611]' : 'text-[#5C5547] hover:text-[#181611]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Quality Insights
            {pendingEscalationCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#181611] text-white text-[10px] font-bold">
                {pendingEscalationCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {viewMode === 'insights' ? (
        <QualityInsightsPanel
          onOpenSurvey={(surveyId) => {
            const target = surveys.find((s) => s.id === surveyId);
            if (target) setSelectedSurvey(target);
          }}
        />
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'SUBMITTED', label: 'Pending Review' },
            { id: 'RETURNED', label: 'Returned' },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'REJECTED', label: 'Rejected' },
            { id: 'ALL', label: 'All' },
          ].map((t) => {
            const count =
              t.id === 'ALL'
                ? surveys.length
                : surveys.filter((s) => s.status === t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setStatusTab(t.id as typeof statusTab);
                  setFocusedIndex(0);
                }}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold border transition ${
                  statusTab === t.id
                    ? 'bg-[#FDC513] text-[#181611] border-[#D9AE00]'
                    : 'bg-white text-[#726C5D] border-[#E7E2D4] hover:text-[#181611]'
                }`}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="w-full sm:w-72">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setFocusedIndex(0);
            }}
            placeholder="Search queue..."
          />
        </div>
      </div>

      <div className="hidden md:flex items-center justify-between text-[11.5px] text-[#726C5D] px-1">
        <span className="inline-flex items-center gap-1.5">
          <Keyboard className="w-3.5 h-3.5 text-[#8C6200]" />
          Shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E7E2D4] font-mono">J</kbd>/<kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E7E2D4] font-mono">K</kbd> navigate ·{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E7E2D4] font-mono">V</kbd> view ·{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E7E2D4] font-mono">A</kbd> approve ·{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E7E2D4] font-mono">R</kbd> return ·{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-white border border-[#E7E2D4] font-mono">X</kbd> reject
        </span>
        <span>{filtered.length} in queue</span>
      </div>

      <div className="bg-white border border-[#E7E2D4] rounded-2xl shadow-card overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#FAF8F2] border-b border-[#E7E2D4] text-[11px] font-semibold uppercase tracking-wider text-[#726C5D]">
                <th className="px-4 py-3">Survey ID</th>
                <th className="px-4 py-3">Household Name</th>
                <th className="px-4 py-3">Volunteer</th>
                <th className="px-4 py-3">Cluster</th>
                <th className="px-4 py-3">Submission Date</th>
                <th className="px-4 py-3">Document Status</th>
                <th className="px-4 py-3">Review Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E2D4] text-xs">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#726C5D]">
                    No surveys in this queue.
                  </td>
                </tr>
              )}
              {filtered.map((s, idx) => {
                const hhDocs = documents.filter((d) => d.householdId === s.householdId);
                const verifiedCount = hhDocs.filter((d) => d.verificationStatus === 'VERIFIED').length;
                const quality = defaultQualityService.evaluate({
                  survey: s,
                  documents: hhDocs,
                  peerSurveys: surveys,
                  requiredDocCategoryIds,
                  policy: qualityPolicy,
                });
                const flagCount = quality.errors.length + quality.warnings.length;
                const allowed = decisionsFor(currentUser.role, s.status);
                const active = idx === focusedIndex;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setFocusedIndex(idx)}
                    className={`cursor-pointer transition-colors ${
                      active ? 'bg-[#FFFDF4] ring-1 ring-inset ring-[#FDC513]/40' : 'hover:bg-[#FAF8F2]'
                    }`}
                  >
                    <td className="px-4 py-3 font-bold text-[#181611]">
                      <div>{s.surveyCode || 'Unsynced'}</div>
                      {flagCount > 0 && (
                        <div className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-[#FFF5E1] text-[#9A6800] text-[10.5px] font-semibold">
                          {flagCount} quality flag{flagCount === 1 ? '' : 's'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#181611]">
                      {s.profile.headName || '—'}
                    </td>
                    <td className="px-4 py-3 text-[#726C5D]">{s.volunteerName}</td>
                    <td className="px-4 py-3">{s.clusterName}</td>
                    <td className="px-4 py-3 text-[#726C5D]">
                      {s.submittedAt?.slice(0, 10) ?? s.profile.surveyDate}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-[#FAF8F2] border border-[#E7E2D4] font-semibold">
                        {verifiedCount}/{hhDocs.length} verified
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedIndex(idx);
                            setSelectedSurvey(s);
                          }}
                          className="min-h-[34px] px-2.5 rounded-lg border border-[#E7E2D4] bg-white hover:bg-[#FAF8F2] font-semibold inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#8C6200]" />
                          View
                        </button>
                        {allowed.includes('APPROVE') && (
                          <button
                            type="button"
                            onClick={() => setReviewAction({ survey: s, decision: 'APPROVE' })}
                            title="Approve (A)"
                            aria-label={`Approve ${s.surveyCode}`}
                            className="p-2 rounded-lg text-[#8C6200] hover:bg-[#FFF8D6]"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {allowed.includes('RETURN') && (
                          <button
                            type="button"
                            onClick={() => setReviewAction({ survey: s, decision: 'RETURN' })}
                            title="Return for Correction (R)"
                            aria-label={`Return ${s.surveyCode}`}
                            className="p-2 rounded-lg text-amber-600 hover:bg-amber-50"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {allowed.includes('REJECT') && (
                          <button
                            type="button"
                            onClick={() => setReviewAction({ survey: s, decision: 'REJECT' })}
                            title="Reject (X)"
                            aria-label={`Reject ${s.surveyCode}`}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-[#E7E2D4]">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-[#726C5D]">No surveys in this queue.</div>
          )}
          {filtered.map((s) => {
            const allowed = decisionsFor(currentUser.role, s.status);
            return (
              <div key={s.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-[#181611]">
                      {s.surveyCode || 'Unsynced'} • {s.profile.headName || '—'}
                    </div>
                    <div className="text-xs text-[#726C5D]">
                      {s.clusterName} • {s.volunteerName}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSurvey(s)}
                    className="flex-1 min-h-[40px] rounded-xl border border-[#E7E2D4] text-xs font-semibold"
                  >
                    View Survey
                  </button>
                  {allowed.includes('APPROVE') && (
                    <button
                      type="button"
                      onClick={() => setReviewAction({ survey: s, decision: 'APPROVE' })}
                      className="min-h-[40px] px-3 rounded-xl bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-xs font-bold"
                    >
                      Approve
                    </button>
                  )}
                  {allowed.includes('RETURN') && (
                    <button
                      type="button"
                      onClick={() => setReviewAction({ survey: s, decision: 'RETURN' })}
                      className="min-h-[40px] px-3 rounded-xl bg-amber-500 text-white text-xs font-bold"
                    >
                      Return
                    </button>
                  )}
                  {allowed.includes('REJECT') && (
                    <button
                      type="button"
                      onClick={() => setReviewAction({ survey: s, decision: 'REJECT' })}
                      className="min-h-[40px] px-3 rounded-xl bg-red-600 text-white text-xs font-bold"
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </>
      )}

      <HouseholdDetailDrawer
        survey={selectedSurvey}
        onClose={() => setSelectedSurvey(null)}
        onPreviewDocument={(doc) => setPreviewDoc(doc)}
      />

      <DocumentPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />

      <ConfirmDialog
        open={Boolean(reviewAction)}
        title={
          reviewAction?.decision === 'APPROVE'
            ? 'Approve Survey'
            : reviewAction?.decision === 'RETURN'
              ? 'Return for Correction'
              : 'Reject Survey'
        }
        description={
          reviewAction
            ? `${reviewAction.survey.surveyCode} — ${reviewAction.survey.profile.headName} (${reviewAction.survey.clusterName})`
            : ''
        }
        variant={
          reviewAction?.decision === 'REJECT'
            ? 'danger'
            : reviewAction?.decision === 'RETURN'
              ? 'warning'
              : 'primary'
        }
        requireReason={
          reviewAction?.decision === 'RETURN' || reviewAction?.decision === 'REJECT'
        }
        reasonLabel="Required Review Reason"
        confirmLabel={
          reviewAction?.decision === 'APPROVE'
            ? 'Approve'
            : reviewAction?.decision === 'RETURN'
              ? 'Return Survey'
              : 'Reject Survey'
        }
        onConfirm={async (reason) => {
          if (!reviewAction) return;
          // Await so a failed request keeps the dialog (and the typed reason) open; the store shows the error.
          await reviewSurvey(reviewAction.survey.id, reviewAction.decision, reason);
          const verb = reviewAction.decision === 'APPROVE' ? 'approved' : reviewAction.decision === 'RETURN' ? 'returned for correction' : 'rejected';
          notify(`${reviewAction.survey.surveyCode} ${verb}.`);
          setReviewAction(null);
        }}
        onCancel={() => setReviewAction(null)}
      />
    </AdminLayout>
  );
};

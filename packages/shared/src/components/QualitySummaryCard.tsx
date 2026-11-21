import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  History,
  Info,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { QualityIssue, ResolutionStatus, SurveyQualityReport } from '../types/survey';

export type QualityResolutionActionType =
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'ACKNOWLEDGED'
  | 'SUPERVISOR_APPROVE'
  | 'SUPERVISOR_WAIVE';

export interface QualitySummaryCardProps {
  report: SurveyQualityReport;
  onJumpTo?: (sectionKey?: string, questionId?: string, issue?: QualityIssue) => void;
  onRecordAction?: (issue: QualityIssue, action: QualityResolutionActionType, note?: string) => Promise<void> | void;
  onOverrideIssue?: (issue: QualityIssue, reason: string) => Promise<void> | void;
  canVerify?: boolean;
  canSupervisorAct?: boolean;
  allowSupervisorOverride?: boolean;
  title?: string;
}

const STATUS_BADGE: Record<ResolutionStatus, { label: string; cls: string }> = {
  OPEN: { label: 'Open', cls: 'bg-[#FDECEA] text-[#9B2226] border-[#F5C6C2]' },
  UNDER_REVIEW: { label: 'Under Review', cls: 'bg-[#FFF3CD] text-[#7A5600] border-[#F6E19C]' },
  VERIFIED: { label: 'Verified', cls: 'bg-[#ECFDF3] text-[#15803D] border-[#BBF7D0]' },
  CORRECTED: { label: 'Corrected', cls: 'bg-[#ECFDF3] text-[#15803D] border-[#BBF7D0]' },
  ACKNOWLEDGED: { label: 'Acknowledged', cls: 'bg-[#FFF8D6] text-[#5C4100] border-[#EED77C]' },
  SUPERVISOR_REVIEW_REQUIRED: {
    label: 'Supervisor Review Queued',
    cls: 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]',
  },
  WAIVED_WITH_REASON: { label: 'Waived with Reason', cls: 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]' },
};

const formatStamp = (iso?: string): string => {
  if (!iso) return 'Not saved yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

interface IssueCardProps {
  issue: QualityIssue;
  onJumpTo?: (sectionKey?: string, questionId?: string, issue?: QualityIssue) => void;
  onRecordAction?: (issue: QualityIssue, action: QualityResolutionActionType, note?: string) => Promise<void> | void;
  onOverrideIssue?: (issue: QualityIssue, reason: string) => Promise<void> | void;
  canVerify?: boolean;
  canSupervisorAct?: boolean;
  allowSupervisorOverride?: boolean;
}

const WarningOrErrorCard: React.FC<IssueCardProps> = ({
  issue,
  onJumpTo,
  onRecordAction,
  onOverrideIssue,
  canVerify = false,
  canSupervisorAct = false,
  allowSupervisorOverride = false,
}) => {
  const [noteOpen, setNoteOpen] = useState<'verify' | 'override' | null>(null);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isError = issue.severity === 'error';
  const status: ResolutionStatus = issue.resolutionStatus ?? 'OPEN';
  const statusMeta = STATUS_BADGE[status];
  const isResolved =
    status === 'VERIFIED' ||
    status === 'CORRECTED' ||
    status === 'ACKNOWLEDGED' ||
    status === 'SUPERVISOR_REVIEW_REQUIRED' ||
    status === 'WAIVED_WITH_REASON';
  const targetQuestions = issue.relevantQuestionIds?.length
    ? issue.relevantQuestionIds
    : issue.questionId
      ? [issue.questionId]
      : [];

  const submitNote = async (kind: 'verify' | 'override') => {
    const clean = noteText.trim();
    if (clean.length < 5) {
      setLocalError('Please enter a clear explanation (at least 5 characters).');
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      if (kind === 'verify' && onRecordAction) {
        await onRecordAction(issue, 'VERIFIED', clean);
      } else if (kind === 'override') {
        if (onOverrideIssue) await onOverrideIssue(issue, clean);
        else if (onRecordAction) await onRecordAction(issue, 'SUPERVISOR_WAIVE', clean);
      }
      setNoteOpen(null);
      setNoteText('');
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-[12px] border p-3.5 space-y-2.5 ${
        isError ? 'bg-[#FFF5F5] border-[#F5C6C2]' : 'bg-[#FFFDF5] border-[#F6E19C]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          {isError ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C93B32]" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                  isError ? 'bg-[#C93B32] text-white' : 'bg-[#D97706] text-white'
                }`}
              >
                {issue.severity}
              </span>
              <span className="text-[13.5px] font-semibold text-[#181611]">{issue.title}</span>
            </div>
            {targetQuestions.length > 0 && (
              <div className="text-[11.5px] font-medium text-[#625C4E] mt-0.5">
                Affected question{targetQuestions.length > 1 ? 's' : ''}:{' '}
                <span className="font-mono font-semibold text-[#181611]">{targetQuestions.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 ${statusMeta.cls}`}>
          {statusMeta.label}
        </span>
      </div>

      {issue.answeredSummary && (
        <div className="rounded-[8px] bg-white/80 border border-[#E7E2D4] px-2.5 py-1.5 text-[12px] text-[#3F3A2E]">
          <span className="font-semibold text-[#625C4E]">Recorded answer: </span>
          {issue.answeredSummary}
        </div>
      )}

      <div className="text-[12.5px] text-[#3F3A2E] space-y-1 leading-relaxed">
        <p>{issue.detail}</p>
        {issue.explanation && issue.explanation !== issue.detail && (
          <p className="text-[12px] text-[#5C5547]">{issue.explanation}</p>
        )}
        {issue.suggestedCorrection && (
          <p className="text-[12px] font-medium text-[#181611]">
            <span className="text-[#8C6200]">Recommended check: </span>
            {issue.suggestedCorrection}
          </p>
        )}
      </div>

      {(issue.overrideReason || issue.resolutionNote) && (
        <div className="rounded-[8px] bg-white border border-[#E7E2D4] px-2.5 py-1.5 text-[12px] text-[#181611]">
          <span className="font-semibold">{issue.overrideReason ? 'Override reason: ' : 'Verification note: '}</span>
          {issue.overrideReason || issue.resolutionNote}
          {issue.resolvedByName && <span className="text-[#726C5D]"> — {issue.resolvedByName}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {onJumpTo &&
          (targetQuestions.length > 0 ? (
            targetQuestions.map((qId) => (
              <button
                key={qId}
                type="button"
                onClick={() => onJumpTo(issue.sectionKey, qId, issue)}
                className="min-h-[34px] px-2.5 py-1 rounded-[8px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[12px] font-semibold inline-flex items-center gap-1"
              >
                Review {qId}
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            ))
          ) : issue.sectionKey ? (
            <button
              type="button"
              onClick={() => onJumpTo(issue.sectionKey, issue.questionId, issue)}
              className="min-h-[34px] px-2.5 py-1 rounded-[8px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[12px] font-semibold inline-flex items-center gap-1"
            >
              Review Section
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          ) : null)}

        {canVerify && onRecordAction && issue.supportsVerifiedException && !isResolved && (
          <button
            type="button"
            onClick={() => {
              setNoteOpen(noteOpen === 'verify' ? null : 'verify');
              setLocalError(null);
            }}
            className="min-h-[34px] px-2.5 py-1 rounded-[8px] border border-[#D9AE00]/50 bg-white hover:bg-[#FFF8D6] text-[#6E4D00] text-[12px] font-semibold"
          >
            Mark as verified
          </button>
        )}

        {!issue.supportsVerifiedException && isError && status === 'OPEN' && (
          <span className="text-[11.5px] font-medium text-[#9B2226]">
            Direct fix required on survey questions
          </span>
        )}

        {canSupervisorAct &&
          onRecordAction &&
          status === 'SUPERVISOR_REVIEW_REQUIRED' &&
          issue.supervisorReviewStatus !== 'APPROVED' && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRecordAction(issue, 'SUPERVISOR_APPROVE', 'Supervisor reviewed and approved valid field exception');
                } finally {
                  setBusy(false);
                }
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-[8px] bg-[#181611] text-white text-[12px] font-semibold hover:bg-[#322E24] disabled:opacity-50"
            >
              Approve Exception
            </button>
          )}

        {canSupervisorAct &&
          allowSupervisorOverride &&
          (onOverrideIssue || onRecordAction) &&
          status !== 'WAIVED_WITH_REASON' && (
            <button
              type="button"
              onClick={() => {
                setNoteOpen(noteOpen === 'override' ? null : 'override');
                setLocalError(null);
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-[8px] border border-[#C7D2FE] bg-[#EEF2FF] hover:bg-[#E0E7FF] text-[#3730A3] text-[12px] font-semibold"
            >
              Supervisor override
            </button>
          )}
      </div>

      {noteOpen && (
        <div className="rounded-[10px] bg-white border border-[#E7E2D4] p-3 space-y-2">
          <label className="block text-[12px] font-semibold text-[#181611]">
            {noteOpen === 'override'
              ? 'Mandatory supervisor override reason (logged to audit trail):'
              : 'Explain why current responses are accurate in the field:'}
          </label>
          <textarea
            rows={2}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={
              noteOpen === 'override'
                ? 'e.g. Verified dual shelter arrangement with field supervisor call.'
                : 'e.g. Household sleeps at roadside camp nightly but relatives host elderly member in brick room.'
            }
            className="w-full rounded-[8px] border border-[#E7E2D4] px-2.5 py-2 text-[12.5px] text-[#181611] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40"
          />
          {localError && <p className="text-[11.5px] font-medium text-[#C93B32]">{localError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submitNote(noteOpen)}
              className="h-8 px-3 rounded-[8px] bg-[#181611] text-white text-[12px] font-semibold hover:bg-[#322E24] disabled:opacity-50"
            >
              {busy ? 'Saving…' : noteOpen === 'override' ? 'Confirm Override' : 'Confirm Verified'}
            </button>
            <button
              type="button"
              onClick={() => {
                setNoteOpen(null);
                setNoteText('');
                setLocalError(null);
              }}
              className="h-8 px-3 rounded-[8px] border border-[#E7E2D4] text-[12px] font-medium text-[#5C5547] hover:bg-[#FAF8F2]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const QualitySummaryCard: React.FC<QualitySummaryCardProps> = ({
  report,
  onJumpTo,
  onRecordAction,
  onOverrideIssue,
  canVerify = false,
  canSupervisorAct = false,
  allowSupervisorOverride = false,
  title = 'Survey Quality Checker',
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);

  const scoreColor =
    report.completenessScore >= 90
      ? 'bg-[#FDC513]'
      : report.completenessScore >= 70
        ? 'bg-[#D97706]'
        : 'bg-[#C93B32]';

  const totalQs = report.totalQuestions ?? QUESTIONS_FALLBACK_COUNT;
  const answeredQs = report.answeredQuestions ?? report.answeredRequired;
  const missingCount = report.missingQuestionIds?.length ?? Math.max(0, report.totalRequired - report.answeredRequired);
  const infos = report.infos ?? [];
  const docComp = report.documentCompletion;
  const history = report.history ?? [];
  const warningsAndErrors = [...report.errors, ...report.warnings];
  const advisoriesAndInfos = [...report.advisories, ...infos];

  return (
    <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-4">
      {/* Section A: Survey Completion */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[#181611] inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#8C6200]" />
              {title}
            </h3>
            <p className="text-[12px] text-[#625C4E] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Last saved: {formatStamp(report.lastSavedAt)}
              </span>
              {report.ruleCountEvaluated ? <span>· {report.ruleCountEvaluated} rules active</span> : null}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[20px] font-extrabold text-[#181611] tabular-nums">{report.completenessScore}%</div>
            <div className="text-[11px] font-medium text-[#625C4E]">Overall Completion</div>
          </div>
        </div>

        <div className="h-2 w-full rounded-full bg-[#EFECE2] overflow-hidden">
          <div className={`h-full rounded-full transition-all ${scoreColor}`} style={{ width: `${report.completenessScore}%` }} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          <div className="rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] px-2.5 py-2">
            <div className="text-[#625C4E] text-[11px]">Answered Questions</div>
            <div className="font-bold text-[#181611] tabular-nums">{answeredQs} / {totalQs}</div>
          </div>
          <div className="rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] px-2.5 py-2">
            <div className="text-[#625C4E] text-[11px]">Mandatory Items</div>
            <div className="font-bold text-[#181611] tabular-nums">{report.answeredRequired} / {report.totalRequired}</div>
          </div>
          <div className="rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] px-2.5 py-2">
            <div className="text-[#625C4E] text-[11px]">Missing Responses</div>
            <div className={`font-bold tabular-nums ${missingCount > 0 ? 'text-[#B45309]' : 'text-[#15803D]'}`}>
              {missingCount} {missingCount === 1 ? 'item' : 'items'}
            </div>
          </div>
          <div className="rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] px-2.5 py-2">
            <div className="text-[#625C4E] text-[11px] flex items-center gap-1">
              <FileCheck2 className="w-3 h-3" /> Documents
            </div>
            <div className="font-bold text-[#181611] tabular-nums">
              {docComp ? `${docComp.uploadedCount} (${docComp.verifiedCount} verified)` : '0 attached'}
            </div>
          </div>
        </div>
      </div>

      {/* Section B: Quality Status (4 severities) */}
      <div className="space-y-2">
        <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#625C4E]">Quality Status Summary</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          <div className={`rounded-[10px] border px-2.5 py-2 ${report.errors.length > 0 ? 'bg-[#FDECEA] border-[#F5C6C2] text-[#9B2226]' : 'bg-[#FAF8F2] border-[#E7E2D4] text-[#5C5547]'}`}>
            <div className="text-[11px] font-semibold">Critical Errors</div>
            <div className="text-[16px] font-extrabold tabular-nums">{report.errors.length}</div>
          </div>
          <div className={`rounded-[10px] border px-2.5 py-2 ${report.warnings.length > 0 ? 'bg-[#FFF8E6] border-[#F6E19C] text-[#8A5B00]' : 'bg-[#FAF8F2] border-[#E7E2D4] text-[#5C5547]'}`}>
            <div className="text-[11px] font-semibold">Warnings</div>
            <div className="text-[16px] font-extrabold tabular-nums">{report.warnings.length}</div>
          </div>
          <div className={`rounded-[10px] border px-2.5 py-2 ${report.advisories.length > 0 ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]' : 'bg-[#FAF8F2] border-[#E7E2D4] text-[#5C5547]'}`}>
            <div className="text-[11px] font-semibold">Advisories</div>
            <div className="text-[16px] font-extrabold tabular-nums">{report.advisories.length}</div>
          </div>
          <div className="rounded-[10px] border px-2.5 py-2 bg-[#FAF8F2] border-[#E7E2D4] text-[#5C5547]">
            <div className="text-[11px] font-semibold">Informational</div>
            <div className="text-[16px] font-extrabold tabular-nums">{infos.length}</div>
          </div>
        </div>

        {report.canSubmit === false && (report.submissionBlockReasons?.length ?? 0) > 0 ? (
          <div className="rounded-[10px] bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[12.5px] text-[#7A231E] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#C93B32]" />
            <div>
              <span className="font-semibold">Submission policy gate: </span>
              {report.submissionBlockReasons?.[0]}
            </div>
          </div>
        ) : warningsAndErrors.length === 0 ? (
          <div className="rounded-[10px] bg-[#FFF8D6] border border-[#EED77C] px-3 py-2 text-[12.5px] text-[#5C4100] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#8C6200]" />
            No critical errors or consistency warnings detected.
          </div>
        ) : null}
      </div>

      {/* Section C: Error & Warning Cards */}
      {warningsAndErrors.length > 0 && (
        <div className="space-y-2.5">
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#625C4E]">
            Issues Requiring Attention ({warningsAndErrors.length})
          </div>
          {warningsAndErrors.map((issue) => (
            <WarningOrErrorCard
              key={issue.id}
              issue={issue}
              onJumpTo={onJumpTo}
              onRecordAction={onRecordAction}
              onOverrideIssue={onOverrideIssue}
              canVerify={canVerify}
              canSupervisorAct={canSupervisorAct}
              allowSupervisorOverride={allowSupervisorOverride}
            />
          ))}
        </div>
      )}

      {/* Section D: Supervisor Advisory & Info Cards */}
      {advisoriesAndInfos.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11.5px] font-bold uppercase tracking-wide text-[#1E40AF] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Supervisor Analytical Advisories & Guidance ({advisoriesAndInfos.length})
          </div>
          {advisoriesAndInfos.map((item) => {
            const isInfo = item.severity === 'info';
            const qIds = item.relevantQuestionIds?.length
              ? item.relevantQuestionIds
              : item.questionId
                ? [item.questionId]
                : [];
            return (
              <div
                key={item.id}
                className={`rounded-[10px] border p-3 space-y-1.5 text-[12.5px] ${
                  isInfo ? 'bg-[#FAF8F2] border-[#E7E2D4] text-[#3F3A2E]' : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isInfo ? 'bg-[#E7E2D4] text-[#5C5547]' : 'bg-[#1E40AF] text-white'
                      }`}
                    >
                      {item.severity}
                    </span>
                    <span>{item.title}</span>
                  </div>
                  <span className="text-[10.5px] font-medium opacity-75">Does not block submission</span>
                </div>
                <p>{item.detail}</p>
                {item.dataInterpretation && (
                  <p className="text-[12px]">
                    <span className="font-semibold">Data interpretation: </span>
                    {item.dataInterpretation}
                  </p>
                )}
                {item.suggestedSupervisorAction && (
                  <p className="text-[12px]">
                    <span className="font-semibold">Supervisor action: </span>
                    {item.suggestedSupervisorAction}
                  </p>
                )}
                {onJumpTo && qIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {qIds.map((qId) => (
                      <button
                        key={qId}
                        type="button"
                        onClick={() => onJumpTo(item.sectionKey, qId, item)}
                        className="text-[11.5px] font-semibold underline hover:opacity-80"
                      >
                        Inspect {qId}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Section E: Validation History */}
      <div className="border-t border-[#EFECE2] pt-3">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full flex items-center justify-between text-[12.5px] font-semibold text-[#5C5547] hover:text-[#181611]"
        >
          <span className="inline-flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            Validation History ({history.length})
          </span>
          {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {historyOpen && (
          <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <p className="text-[12px] text-[#726C5D]">No validation transition events logged yet.</p>
            ) : (
              history.map((h) => (
                <div
                  key={h.id}
                  className="rounded-[8px] bg-[#FAF8F2] border border-[#E7E2D4] px-2.5 py-2 text-[11.5px] space-y-0.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-[#181611]">
                      {h.ruleTitle} <span className="font-mono text-[10.5px] text-[#625C4E]">[{h.eventType}]</span>
                    </span>
                    <span className="text-[#726C5D]">{formatStamp(h.timestamp)}</span>
                  </div>
                  <div className="text-[#5C5547] flex flex-wrap gap-x-2">
                    <span>Status: <strong>{h.status}</strong></span>
                    {h.actorName && <span>Actor: {h.actorName}</span>}
                    {h.supervisorStatus && <span>Supervisor: {h.supervisorStatus}</span>}
                  </div>
                  {h.note && <div className="text-[#3F3A2E] italic">&ldquo;{h.note}&rdquo;</div>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
};

const QUESTIONS_FALLBACK_COUNT = 36;

export interface QualityReviewReturnBarProps {
  issue: QualityIssue;
  activeQuestionId?: string | null;
  onJumpToQuestion: (questionId: string) => void;
  onReturnToReview: () => void;
}

/**
 * Persistent return-to-review banner displayed when a volunteer clicks "Review Qx"
 * from the Quality Checker, allowing rapid switching between related questions without losing edits.
 */
export const QualityReviewReturnBar: React.FC<QualityReviewReturnBarProps> = ({
  issue,
  activeQuestionId,
  onJumpToQuestion,
  onReturnToReview,
}) => {
  const qIds = issue.relevantQuestionIds?.length
    ? issue.relevantQuestionIds
    : issue.questionId
      ? [issue.questionId]
      : [];
  const isError = issue.severity === 'error';

  return (
    <div
      className={`rounded-[12px] border px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-sm ${
        isError ? 'bg-[#FDECEA] border-[#F5C6C2] text-[#7A231E]' : 'bg-[#FFF8E6] border-[#F6E19C] text-[#6E4900]'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold truncate">{issue.title}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {qIds.map((qId) => (
            <button
              key={qId}
              type="button"
              onClick={() => onJumpToQuestion(qId)}
              className={`h-7 px-2 rounded-md text-[11.5px] font-semibold border ${
                activeQuestionId === qId
                  ? 'bg-[#181611] text-white border-[#181611]'
                  : 'bg-white text-[#181611] border-[#E7E2D4] hover:bg-[#FAF8F2]'
              }`}
            >
              {qId}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onReturnToReview}
        className="h-9 px-3 rounded-[8px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[12px] font-bold shrink-0"
      >
        Back to Review
      </button>
    </div>
  );
};

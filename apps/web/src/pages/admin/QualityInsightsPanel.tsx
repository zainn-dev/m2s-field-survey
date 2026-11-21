import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Info,
  RotateCcw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { QUESTIONS } from '../../data/questionnaire';
import { defaultQualitySummary, type QualityInsightsFilter } from '@m2s/shared/validation';
import type { QualitySeverity, ResolutionStatus } from '@m2s/shared/types/survey';

export interface QualityInsightsPanelProps {
  onOpenSurvey?: (surveyId: string) => void;
  title?: string;
  compact?: boolean;
  onOpenFullInsights?: () => void;
}

const SEVERITY_BADGE: Record<QualitySeverity, { label: string; cls: string }> = {
  error: { label: 'Critical Error', cls: 'bg-[#FDECEA] text-[#9B2226] border-[#F5C6C2]' },
  warning: { label: 'Warning', cls: 'bg-[#FFF5E0] text-[#7A5600] border-[#F6E19C]' },
  advisory: { label: 'Advisory', cls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' },
  info: { label: 'Info', cls: 'bg-[#FAF8F2] text-[#5C5547] border-[#E7E2D4]' },
};

const RESOLUTION_OPTIONS: { value: ResolutionStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'CORRECTED', label: 'Corrected' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'SUPERVISOR_REVIEW_REQUIRED', label: 'Supervisor Review Required' },
  { value: 'WAIVED_WITH_REASON', label: 'Waived with Reason' },
];

const RESOLUTION_BADGE: Record<ResolutionStatus, string> = {
  OPEN: 'bg-[#FDECEA] text-[#9B2226] border-[#F5C6C2]',
  UNDER_REVIEW: 'bg-[#FFF3CD] text-[#7A5600] border-[#F6E19C]',
  VERIFIED: 'bg-[#ECFDF3] text-[#15803D] border-[#BBF7D0]',
  CORRECTED: 'bg-[#ECFDF3] text-[#15803D] border-[#BBF7D0]',
  ACKNOWLEDGED: 'bg-[#FFF8D6] text-[#5C4100] border-[#EED77C]',
  SUPERVISOR_REVIEW_REQUIRED: 'bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]',
  WAIVED_WITH_REASON: 'bg-[#EEF2FF] text-[#3730A3] border-[#C7D2FE]',
};

const INITIAL_FILTER: QualityInsightsFilter = {
  dateFrom: '',
  dateTo: '',
  volunteerId: '',
  surveyStatus: '',
  severity: '',
  questionId: '',
  resolutionStatus: '',
};

const formatAvgMinutes = (mins: number | null): string => {
  if (mins == null) return '—';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
};

const inputCls =
  'h-9 rounded-lg border border-[#E7E2D4] bg-white px-2.5 text-xs text-[#181611] focus:outline-none focus:border-[#D9AE00]';

export const QualityInsightsPanel: React.FC<QualityInsightsPanelProps> = ({
  onOpenSurvey,
  title = 'Quality Insights & Supervisor Queue',
  compact = false,
  onOpenFullInsights,
}) => {
  const { surveys, documents, users, docCategories, study, qualityPolicy } = useAppStore();
  const [filter, setFilter] = useState<QualityInsightsFilter>(INITIAL_FILTER);

  const requiredDocCategoryIds = useMemo(
    () => (study.requireDocumentsForSubmission ? docCategories.filter((c) => c.enabled && c.requiredForSubmission).map((c) => c.id) : []),
    [study.requireDocumentsForSubmission, docCategories]
  );

  const volunteerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) {
      if (u.role === 'VOLUNTEER' || surveys.some((s) => s.volunteerId === u.id)) {
        map.set(u.id, u.name);
      }
    }
    for (const s of surveys) {
      if (!map.has(s.volunteerId)) map.set(s.volunteerId, s.volunteerName || s.volunteerId);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, surveys]);

  const questionOptions = useMemo(() => ['B9', ...QUESTIONS.map((q) => q.id)], []);

  const hasActiveFilters = Boolean(
    filter.dateFrom ||
      filter.dateTo ||
      filter.volunteerId ||
      filter.surveyStatus ||
      filter.severity ||
      filter.questionId ||
      filter.resolutionStatus
  );

  const summary = useMemo(
    () =>
      defaultQualitySummary.aggregatePortfolio(surveys, {
        documents,
        requiredDocCategoryIds,
        policy: qualityPolicy,
        filter,
      }),
    [surveys, documents, requiredDocCategoryIds, qualityPolicy, filter]
  );

  const findSurvey = (id: string) => surveys.find((s) => s.id === id);

  return (
    <section
      aria-label="Quality Insights"
      className="bg-white rounded-[16px] border border-[#E7E2D4] shadow-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E7E2D4] bg-[#FAF8F2] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#FDC513] text-[#181611] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-[#181611] leading-snug">{title}</h2>
            <p className="text-xs text-[#726C5D]">
              Live rule validation telemetry, inconsistency rates, and supervisor exception queue across {summary.totalSurveysReviewed} survey
              {summary.totalSurveysReviewed === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilter(INITIAL_FILTER)}
              className="h-8 px-2.5 rounded-lg border border-[#E7E2D4] bg-white hover:bg-[#EFECE2] text-xs font-semibold text-[#5C5547] inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset filters
            </button>
          )}
          {onOpenFullInsights && (
            <button
              type="button"
              onClick={onOpenFullInsights}
              className="h-8 px-3 rounded-lg bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-xs font-bold"
            >
              Open Full Queue
            </button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      {!compact && (
        <div className="px-5 py-3 border-b border-[#E7E2D4] bg-[#FFFEFA] flex flex-wrap items-end gap-2.5">
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[#726C5D] mr-1 self-center">
            <Filter className="w-3.5 h-3.5 text-[#8C6200]" />
            Filters
          </div>
          <label className="flex flex-col gap-1 text-[11px] text-[#5C5547]">
            From
            <input
              type="date"
              aria-label="Filter from date"
              className={inputCls}
              value={filter.dateFrom ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5C5547]">
            To
            <input
              type="date"
              aria-label="Filter to date"
              className={inputCls}
              value={filter.dateTo ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5C5547]">
            Volunteer
            <select
              aria-label="Filter by volunteer"
              className={inputCls}
              value={filter.volunteerId ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, volunteerId: e.target.value }))}
            >
              <option value="">All volunteers</option>
              {volunteerOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5C5547]">
            Survey Status
            <select
              aria-label="Filter by survey status"
              className={inputCls}
              value={filter.surveyStatus ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, surveyStatus: e.target.value }))}
            >
              <option value="">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_SYNC">Pending Sync</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="RETURNED">Returned</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5C5547]">
            Severity
            <select
              aria-label="Filter by rule severity"
              className={inputCls}
              value={filter.severity ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, severity: (e.target.value as QualitySeverity) || '' }))}
            >
              <option value="">All severities</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="advisory">Advisory</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5C5547]">
            Question
            <select
              aria-label="Filter by question number"
              className={inputCls}
              value={filter.questionId ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, questionId: e.target.value }))}
            >
              <option value="">All questions</option>
              {questionOptions.map((qId) => (
                <option key={qId} value={qId}>
                  {qId}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-[#5C5547]">
            Resolution
            <select
              aria-label="Filter by resolution status"
              className={inputCls}
              value={filter.resolutionStatus ?? ''}
              onChange={(e) => setFilter((f) => ({ ...f, resolutionStatus: (e.target.value as ResolutionStatus) || '' }))}
            >
              <option value="">All resolutions</option>
              {RESOLUTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* KPI Strip */}
      <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-b border-[#EFECE2]">
        <StatTile label="Surveys Reviewed" value={summary.totalSurveysReviewed} icon={<BarChart3 className="w-4 h-4 text-[#8C6200]" />} />
        <StatTile
          label="Critical Errors"
          value={summary.surveysWithErrors}
          hint="surveys affected"
          tone="danger"
          icon={<AlertCircle className="w-4 h-4 text-[#B42318]" />}
        />
        <StatTile
          label="With Warnings"
          value={summary.surveysWithWarnings}
          hint="surveys flagged"
          tone="warning"
          icon={<AlertTriangle className="w-4 h-4 text-[#B54708]" />}
        />
        <StatTile
          label="With Advisories"
          value={summary.surveysWithAdvisories}
          hint="analytical flags"
          tone="info"
          icon={<Info className="w-4 h-4 text-[#1D4ED8]" />}
        />
        <StatTile
          label="Unresolved Issues"
          value={summary.unresolvedValidationIssues}
          hint={`of ${summary.totalIssues} total`}
          tone={summary.unresolvedValidationIssues > 0 ? 'warning' : 'success'}
          icon={<ShieldAlert className="w-4 h-4 text-[#92400E]" />}
        />
        <StatTile
          label="Resolution Rate"
          value={`${summary.resolutionRatePct}%`}
          hint={`Avg time: ${formatAvgMinutes(summary.avgResolutionMinutes)}`}
          tone="success"
          icon={<Clock className="w-4 h-4 text-[#15803D]" />}
        />
      </div>

      {/* Main Content */}
      <div className="p-5 space-y-5">
        {/* Supervisor Pending-Review Queue */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="text-[13px] font-bold text-[#181611] uppercase tracking-wider">
              Supervisor Pending-Review Queue ({summary.pendingSupervisorQueue.length})
            </h3>
            <span className="text-xs text-[#726C5D]">Errors, unverified exceptions, and supervisor-escalated warnings</span>
          </div>
          {summary.pendingSupervisorQueue.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E7E2D4] bg-[#FAF8F2] px-4 py-5 text-center text-xs text-[#726C5D]">
              <CheckCircle2 className="w-4 h-4 text-[#15803D] mx-auto mb-1" />
              No pending validation escalations match the active filters.
            </div>
          ) : (
            <div className="border border-[#E7E2D4] rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF8F2] border-b border-[#E7E2D4] text-[11px] font-semibold uppercase tracking-wider text-[#726C5D]">
                    <th className="px-3 py-2.5">Survey</th>
                    <th className="px-3 py-2.5">Volunteer · Cluster</th>
                    <th className="px-3 py-2.5">Rule & Questions</th>
                    <th className="px-3 py-2.5">Severity</th>
                    <th className="px-3 py-2.5">Resolution</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE2]">
                  {summary.pendingSupervisorQueue.slice(0, compact ? 5 : 25).map((item) => {
                    const sev = SEVERITY_BADGE[item.severity];
                    const resCls = RESOLUTION_BADGE[item.resolutionStatus];
                    const exists = Boolean(findSurvey(item.surveyId));
                    return (
                      <tr key={`${item.surveyId}-${item.ruleId}`} className="hover:bg-[#FFFDF4]">
                        <td className="px-3 py-2.5 font-semibold text-[#181611] whitespace-nowrap">
                          {item.surveyCode || 'Unsynced'}
                          <div className="text-[11px] font-normal text-[#726C5D]">{item.surveyStatus}</div>
                        </td>
                        <td className="px-3 py-2.5 text-[#363127]">
                          <div className="font-medium">{item.volunteerName}</div>
                          <div className="text-[11px] text-[#726C5D]">{item.clusterName}</div>
                        </td>
                        <td className="px-3 py-2.5 max-w-[320px]">
                          <div className="font-semibold text-[#181611]">{item.ruleTitle}</div>
                          <div className="text-[11px] text-[#726C5D] flex flex-wrap gap-1 mt-0.5">
                            {item.relevantQuestionIds.map((qId) => (
                              <span key={qId} className="px-1.5 py-0.5 rounded bg-[#EFECE2] font-mono text-[10.5px] text-[#363127]">
                                {qId}
                              </span>
                            ))}
                            {item.note && <span className="italic text-[#5C5547]">“{item.note}”</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${sev.cls}`}>{sev.label}</span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${resCls}`}>
                            {item.resolutionStatus.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {onOpenSurvey && exists && (
                            <button
                              type="button"
                              onClick={() => onOpenSurvey(item.surveyId)}
                              className="h-8 px-2.5 rounded-lg border border-[#E7E2D4] bg-white hover:bg-[#FAF8F2] font-semibold text-[#181611] inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#8C6200]" />
                              Inspect
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!compact && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Most Frequently Triggered Rules */}
            <div className="border border-[#E7E2D4] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#FAF8F2] border-b border-[#E7E2D4] flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#181611]">Most Frequently Triggered Rules</h3>
                <span className="text-[11px] text-[#726C5D]">Top {Math.min(8, summary.topTriggeredRules.length)} rules</span>
              </div>
              {summary.topTriggeredRules.length === 0 ? (
                <p className="p-4 text-xs text-[#726C5D]">No rules triggered for the selected filter.</p>
              ) : (
                <div className="divide-y divide-[#EFECE2]">
                  {summary.topTriggeredRules.slice(0, 8).map((r) => {
                    const sev = SEVERITY_BADGE[r.severity];
                    return (
                      <div key={r.ruleId} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${sev.cls}`}>{r.severity.toUpperCase()}</span>
                            <span className="font-semibold text-[#181611] truncate">{r.title}</span>
                          </div>
                          <div className="text-[11px] text-[#726C5D] mt-0.5 font-mono">{r.ruleId}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-[#181611]">{r.triggeredCount}x</div>
                          <div className="text-[11px] text-[#726C5D]">
                            {r.openCount} open · {r.resolvedCount} resolved
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Questions with Highest Inconsistency Rate */}
            <div className="border border-[#E7E2D4] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#FAF8F2] border-b border-[#E7E2D4] flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#181611]">Questions with Highest Inconsistency Rate</h3>
                <span className="text-[11px] text-[#726C5D]">% of reviewed surveys</span>
              </div>
              {summary.questionInconsistencyRates.length === 0 ? (
                <p className="p-4 text-xs text-[#726C5D]">No question-level flags recorded.</p>
              ) : (
                <div className="divide-y divide-[#EFECE2]">
                  {summary.questionInconsistencyRates.slice(0, 8).map((q) => (
                    <div key={q.questionId} className="px-4 py-2.5 space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#EFECE2] font-mono font-bold text-[#181611]">{q.questionId}</span>
                          <span className="text-[#5C5547]">
                            {q.errorCount} err · {q.warningCount} warn · {q.advisoryCount} adv
                          </span>
                        </div>
                        <span className="font-bold text-[#181611]">{q.inconsistencyRatePct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#EFECE2] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${q.errorCount > 0 ? 'bg-[#C93B32]' : q.warningCount > 0 ? 'bg-[#D99B00]' : 'bg-[#2563EB]'}`}
                          style={{ width: `${Math.min(100, Math.max(4, q.inconsistencyRatePct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Volunteer-wise Quality Statistics */}
            <div className="lg:col-span-2 border border-[#E7E2D4] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#FAF8F2] border-b border-[#E7E2D4] flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#181611] inline-flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#8C6200]" />
                  Volunteer-wise Quality Statistics
                </h3>
                <span className="text-[11px] text-[#726C5D]">{summary.volunteerStats.length} volunteers</span>
              </div>
              {summary.volunteerStats.length === 0 ? (
                <p className="p-4 text-xs text-[#726C5D]">No volunteer records match the current filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF8F2] border-b border-[#E7E2D4] text-[11px] font-semibold uppercase tracking-wider text-[#726C5D]">
                        <th className="px-4 py-2.5">Volunteer</th>
                        <th className="px-4 py-2.5 text-right">Surveys</th>
                        <th className="px-4 py-2.5 text-right">With Errors</th>
                        <th className="px-4 py-2.5 text-right">With Warnings</th>
                        <th className="px-4 py-2.5 text-right">Unresolved</th>
                        <th className="px-4 py-2.5 text-right">Overrides</th>
                        <th className="px-4 py-2.5 text-right">Resolution Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE2]">
                      {summary.volunteerStats.map((v) => (
                        <tr key={v.volunteerId} className="hover:bg-[#FFFDF4]">
                          <td className="px-4 py-2.5 font-semibold text-[#181611]">{v.volunteerName}</td>
                          <td className="px-4 py-2.5 text-right">{v.surveysCount}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#B42318]">{v.surveysWithErrors}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#B54708]">{v.surveysWithWarnings}</td>
                          <td className="px-4 py-2.5 text-right">{v.unresolvedIssues}</td>
                          <td className="px-4 py-2.5 text-right">{v.overridesCount}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#15803D]">{v.resolutionRatePct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

const StatTile: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'danger' | 'warning' | 'info' | 'success';
}> = ({ label, value, hint, icon, tone = 'neutral' }) => {
  const toneCls =
    tone === 'danger'
      ? 'bg-[#FFF5F5] border-[#F5C6C2]'
      : tone === 'warning'
        ? 'bg-[#FFFDF4] border-[#F6E19C]'
        : tone === 'info'
          ? 'bg-[#F5F9FF] border-[#BFDBFE]'
          : tone === 'success'
            ? 'bg-[#F4FBF7] border-[#BBF7D0]'
            : 'bg-[#FAF8F2] border-[#E7E2D4]';

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${toneCls}`}>
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#5C5547]">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-xl font-bold text-[#181611] leading-tight">{value}</div>
      {hint && <div className="text-[11px] text-[#726C5D] mt-0.5">{hint}</div>}
    </div>
  );
};


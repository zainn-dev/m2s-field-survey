import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Table2,
} from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { ExportKind, useAppStore } from '../../store/appStore';
import { PART1_OPTIONS, QUESTIONS } from '../../data/questionnaire';
import { evaluateHouseholdIndices } from '@m2s/shared/utils/studyIndicators';
import type { SurveyStatus } from '../../types/survey';
import { buildCodebookRows, downloadCsv, downloadXlsx, type Cell } from '../../utils/exportHelpers';

const lookupLabel = (list: { code: string; en: string }[], code: string) =>
  list.find((item) => item.code === code)?.en ?? code;

/** Ids travel in the query string; ~200 UUIDs stays well inside proxy URL limits (nginx default 8 KB). */
const MAX_ZIP_IDS = 200;

export const AdminExports: React.FC = () => {
  const { surveys, documents, clusters, downloadExport, notify, logAudit } = useAppStore();
  const [clusterFilter, setClusterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const filteredSurveys = useMemo(() => {
    return surveys.filter((s) => {
      if (clusterFilter && s.clusterId !== clusterFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (dateFrom && s.profile.surveyDate < dateFrom) return false;
      if (dateTo && s.profile.surveyDate > dateTo) return false;
      return true;
    });
  }, [surveys, clusterFilter, statusFilter, dateFrom, dateTo]);

  const filteredDocs = useMemo(() => {
    const hhIds = new Set(filteredSurveys.map((s) => s.householdId));
    return documents.filter((d) => hhIds.has(d.householdId));
  }, [documents, filteredSurveys]);

  const activeFilters = [clusterFilter, statusFilter, dateFrom, dateTo].filter(Boolean).length;

  const runServerExport = async (kind: ExportKind, label: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      const params: Record<string, string | undefined> = {
        clusterId: clusterFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
      };
      if (kind === 'documents.zip') {
        if (statusFilter) {
          // Survey status is not a document field, so the selection is sent as explicit ids.
          if (filteredDocs.length === 0) {
            notify('No documents match the current filters.', 'info');
            return;
          }
          if (filteredDocs.length > MAX_ZIP_IDS) {
            notify(`Too many documents for one ZIP (${filteredDocs.length}). Narrow the date range or cluster to ${MAX_ZIP_IDS} or fewer.`, 'error');
            return;
          }
          params.ids = filteredDocs.map((d) => d.id).join(',');
        }
      } else {
        params.status = statusFilter || undefined;
      }
      await downloadExport(kind, params);
      notify(`Downloaded ${label}`);
    } catch {
      /* store toasted */
    } finally {
      setBusy(null);
    }
  };

  const handleExportExcel = () => {
    if (filteredSurveys.length === 0) return;
    const baselineHeaders: Cell[] = [
      'Survey Code',
      'Survey Date',
      'District (B1)',
      'Village / Relief Camp Name (B1)',
      'Cluster / Camp',
      'Head of Household (B3)',
      'Head Age',
      'Family Size (B4)',
      'Income Before (B9)',
      'Income Now (B9)',
      'Land Owned (B10)',
      'Status',
      'Volunteer',
      'ID Type (B2)',
      'ID Last 4',
      ...QUESTIONS.map((q) => q.id),
      'MPI Score (%)',
      'MPI Poor (>=33.3%)',
      'Hunger Score (Q11, 0-6)',
      'Hunger Category',
    ];
    const baselineRows: Cell[][] = filteredSurveys.map((s) => {
      const idx = evaluateHouseholdIndices(s);
      return [
        s.surveyCode || 'UNSYNCED',
        s.profile.surveyDate,
        lookupLabel(PART1_OPTIONS.b1Districts, s.profile.districtCode ?? '') + (s.profile.districtOther ? ` (${s.profile.districtOther})` : ''),
        s.profile.revenueCircleVillage ?? '',
        s.clusterName,
        s.profile.headName,
        s.profile.headAge,
        s.profile.totalMembers,
        s.profile.incomeBeforeApprox,
        lookupLabel(PART1_OPTIONS.b9Income, s.profile.incomeNowCode),
        lookupLabel(PART1_OPTIONS.b10LandOwned, s.profile.landOwnedCode ?? ''),
        s.status,
        s.volunteerName,
        s.profile.docVerifiedLabel,
        s.profile.idLast4 ? `XXXX-${s.profile.idLast4}` : 'N/A',
        ...QUESTIONS.map((q) => {
          const ans = s.answers[q.id];
          if (!ans) return '';
          if (q.type === 'text' || q.type === 'date') return ans.otherText ?? '';
          return ans.optionCodes.join('|') + (ans.otherText ? ` (${ans.otherText})` : '');
        }),
        idx.mpiAnsweredCount > 0 ? idx.mpiScorePct : '',
        idx.mpiAnsweredCount > 0 ? (idx.isMpiPoor ? 'YES' : 'NO') : '',
        idx.hhsAnsweredCount > 0 ? idx.hhsScore : '',
        idx.hhsAnsweredCount > 0 ? idx.hhsCategory : '',
      ];
    });

    const indicesHeaders: Cell[] = [
      'Survey Code',
      'District (B1)',
      'Cluster',
      'Head',
      'MPI Score (%)',
      'MPI Band',
      'MPI Deprived Indicators',
      'Hunger Score (0-6)',
      'Hunger Category',
      'New Debt (Q20)',
      'Due Process Breach (Q4)',
      'ID Lost (Q24)',
      'Welfare Blocked (Q25b)',
    ];
    const indicesRows: Cell[][] = filteredSurveys.map((s) => {
      const idx = evaluateHouseholdIndices(s);
      return [
        s.surveyCode || 'UNSYNCED',
        lookupLabel(PART1_OPTIONS.b1Districts, s.profile.districtCode ?? ''),
        s.clusterName,
        s.profile.headName,
        idx.mpiScorePct,
        idx.mpiBandLabel,
        idx.mpiDeprivedItems.map((d) => d.qId).join('|'),
        idx.hhsScore,
        idx.hhsCategory,
        idx.tookInformalDebt ? 'YES' : 'NO',
        idx.dueProcessBreach ? 'YES' : 'NO',
        idx.idLostOrBuried ? 'YES' : 'NO',
        idx.pdsBlocked ? 'YES' : 'NO',
      ];
    });

    const summaryHeaders: Cell[] = ['Cluster', 'Code', 'Target', 'Total', 'Approved', 'Submitted', 'Returned', 'Drafts'];
    const summaryRows: Cell[][] = clusters.map((c) => {
      const list = filteredSurveys.filter((s) => s.clusterId === c.id);
      const count = (st: SurveyStatus) => list.filter((s) => s.status === st).length;
      return [c.name, c.code, c.targetHouseholds, list.length, count('APPROVED'), count('SUBMITTED'), count('RETURNED'), count('DRAFT') + count('PENDING_SYNC')];
    });

    const file = downloadXlsx('surveys-baseline', [
      { name: 'Households', rows: [baselineHeaders, ...baselineRows] },
      { name: 'Derived Indices (MPI & HHS)', rows: [indicesHeaders, ...indicesRows] },
      { name: 'Cluster Summary', rows: [summaryHeaders, ...summaryRows] },
      { name: 'SPSS-R Codebook', rows: buildCodebookRows() },
    ]);
    logAudit('export_excel', 'export', 'surveys', `Exported ${filteredSurveys.length} surveys (${file})`);
    notify(`Downloaded ${file}`);
  };

  const handleExportClusterSummaryCsv = () => {
    const header: Cell[] = ['Cluster', 'Code', 'Target Households', 'Filtered Total', 'Approved', 'Submitted', 'Returned', 'Drafts', 'Completion %'];
    const body: Cell[][] = clusters.map((c) => {
      const list = filteredSurveys.filter((s) => s.clusterId === c.id);
      const approved = list.filter((s) => s.status === 'APPROVED').length;
      const submitted = list.filter((s) => s.status === 'SUBMITTED').length;
      const returned = list.filter((s) => s.status === 'RETURNED').length;
      const drafts = list.filter((s) => s.status === 'DRAFT' || s.status === 'PENDING_SYNC').length;
      const pct = c.targetHouseholds > 0 ? Math.round((approved / c.targetHouseholds) * 100) : 0;
      return [c.name, c.code, c.targetHouseholds, list.length, approved, submitted, returned, drafts, `${pct}%`];
    });
    const file = downloadCsv('cluster-summary', [header, ...body]);
    logAudit('export_summary_csv', 'export', 'clusters', `Exported cluster summary CSV (${clusters.length} clusters)`);
    notify(`Downloaded ${file}`);
  };

  const handleExportPdf = () => {
    logAudit('export_pdf', 'export', 'report', `Generated PDF study summary (${filteredSurveys.length} households)`);
    notify('Opening printable PDF summary view', 'info');
    window.print();
  };

  return (
    <AdminLayout
      title="Exports & Data Downloads"
      subtitle="Generate Excel, CSV (wide & SPSS/R long), printable PDF summaries, and household document ZIP archives with privacy safeguards."
    >
      <FilterPanel
        activeCount={activeFilters}
        onReset={() => {
          setClusterFilter('');
          setStatusFilter('');
          setDateFrom('');
          setDateTo('');
        }}
      >
        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-semibold text-[#726C5D] mb-1">Cluster</label>
          <select
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs font-medium"
          >
            <option value="">All Clusters</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-semibold text-[#726C5D] mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs font-medium"
          >
            <option value="">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="SUBMITTED">Pending Review</option>
            <option value="RETURNED">Returned</option>
            <option value="DRAFT">Draft</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-semibold text-[#726C5D] mb-1">From Date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full sm:w-auto min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs"
          />
        </div>

        <div className="w-full sm:w-auto">
          <label className="block text-[11px] font-semibold text-[#726C5D] mb-1">To Date</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full sm:w-auto min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs"
          />
        </div>

        <div className="ml-auto text-xs font-semibold text-[#8C6200] pb-2">
          Scope: {filteredSurveys.length} surveys • {filteredDocs.length} documents
        </div>
      </FilterPanel>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF4FD] text-[#2B5FA8] flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181611]">Surveys CSV (.csv)</h2>
              <p className="text-xs text-[#726C5D] mt-1">
                Server-generated UTF-8 wide dataset (B1–B10 profiles + Q1a–Q28 codes) with CSV formula protection.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!!busy || filteredSurveys.length === 0}
            onClick={() => runServerExport('surveys.csv', `Surveys CSV (${filteredSurveys.length} rows)`)}
            className="min-h-[44px] px-4 rounded-xl bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy === 'surveys.csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Surveys CSV ({filteredSurveys.length})
          </button>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF4FD] text-[#2B5FA8] flex items-center justify-center shrink-0">
              <Table2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181611]">Answers Long CSV (.csv)</h2>
              <p className="text-xs text-[#726C5D] mt-1">
                One row per answered question (`surveyCode`, `questionId`, `optionCodes`) for SPSS, Stata, or R analysis.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!!busy || filteredSurveys.length === 0}
            onClick={() => runServerExport('answers.csv', 'Answers Long CSV (SPSS/R)')}
            className="min-h-[44px] px-4 rounded-xl border border-[#8C6200] text-[#8C6200] hover:bg-[#FFF8D6] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy === 'answers.csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Answers CSV ({filteredSurveys.length})
          </button>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#F3F0FD] text-[#5B3CA8] flex items-center justify-center shrink-0">
              <FileArchive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181611]">Household Documents ZIP</h2>
              <p className="text-xs text-[#726C5D] mt-1">
                Verified archive streamed from private storage with per-household folders, SHA-256 hashes, and `manifest.csv`.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!!busy || filteredDocs.length === 0}
            onClick={() => runServerExport('documents.zip', `Documents ZIP (${filteredDocs.length} records)`)}
            className="min-h-[44px] px-4 rounded-xl bg-[#181611] hover:bg-[#2C281F] text-[#FDC513] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy === 'documents.zip' ? <Loader2 className="w-4 h-4 animate-spin text-[#FDC513]" /> : <FileArchive className="w-4 h-4 text-[#FDC513]" />}
            Download Documents ZIP ({filteredDocs.length})
          </button>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF8D6] text-[#8C6200] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181611]">Excel Workbook (.xlsx)</h2>
              <p className="text-xs text-[#726C5D] mt-1">
                Multi-sheet OOXML workbook containing Baseline Households (B1–B10, Q1a–Q28) and Cluster Summary.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={filteredSurveys.length === 0}
            onClick={handleExportExcel}
            className="min-h-[44px] px-4 rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] hover:bg-[#FFF8D6] text-[#181611] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-[#8C6200]" />
            Export Excel .xlsx ({filteredSurveys.length} rows)
          </button>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF8D6] text-[#8C6200] flex items-center justify-center shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181611]">Cluster Summary CSV</h2>
              <p className="text-xs text-[#726C5D] mt-1">
                Per-cluster target progress breakdown (`Approved`, `Submitted`, `Returned`, `Drafts`, and completion rate).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportClusterSummaryCsv}
            className="min-h-[44px] px-4 rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] hover:bg-[#FFF8D6] text-[#181611] text-xs font-bold inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4 text-[#8C6200]" />
            Export Summary CSV ({clusters.length} clusters)
          </button>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card flex flex-col justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF8D6] text-[#8C6200] flex items-center justify-center shrink-0">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#181611]">Print / Save PDF Report</h2>
              <p className="text-xs text-[#726C5D] mt-1">
                Print-ready executive study brief for Miles2Smile Foundation and TISS faculty supervision.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportPdf}
            className="min-h-[44px] px-4 rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] hover:bg-[#FFF8D6] text-[#181611] text-xs font-bold inline-flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4 text-[#8C6200]" />
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Printable Summary Preview for PDF export */}
      <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
        <h3 className="text-sm font-bold text-[#181611]">
          Export Preview ({filteredSurveys.slice(0, 8).length} of {filteredSurveys.length} shown)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF8F2] border-b border-[#E7E2D4] text-[#726C5D]">
                <th className="px-3 py-2">Survey ID</th>
                <th className="px-3 py-2">Head</th>
                <th className="px-3 py-2">Cluster</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E2D4]">
              {filteredSurveys.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-bold">{s.surveyCode || 'Draft'}</td>
                  <td className="px-3 py-2">{s.profile.headName}</td>
                  <td className="px-3 py-2">{s.clusterName}</td>
                  <td className="px-3 py-2">{s.profile.totalMembers}</td>
                  <td className="px-3 py-2">{s.status}</td>
                  <td className="px-3 py-2">{s.profile.surveyDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

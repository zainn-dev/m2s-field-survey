import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { FilterPanel } from '../../components/ui/FilterPanel';
import { useAppStore } from '../../store/appStore';
import { PART1_OPTIONS, QUESTIONS } from '../../data/questionnaire';
import { aggregateStudyIndices, evaluateHouseholdIndices } from '@m2s/shared/utils/studyIndicators';
import { defaultAnswerNormalizer } from '@m2s/shared/validation';
import { hasDocVerifiedCode } from '@m2s/shared/survey/surveyModel';
import { buildAnalyticsReportSheets, downloadCsv, downloadXlsx, type AnalyticsIndicatorRow } from '../../utils/exportHelpers';

const BarRow: React.FC<{
  label: string;
  count: number;
  total: number;
  missing?: number;
  zeroCount?: number;
  color?: string;
}> = ({ label, count, total, missing, zeroCount, color = 'bg-[#FDC513]' }) => {
  const denom = missing != null ? Math.max(0, total - missing) : total;
  const pct = denom > 0 ? Math.round((count / denom) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between text-xs gap-2">
        <span className="font-medium text-[#181611] truncate">{label}</span>
        <span className="text-[#726C5D] shrink-0 tabular-nums">
          <strong className="text-[#181611]">{count}</strong>/{denom} ({pct}%)
          {zeroCount !== undefined && zeroCount > 0 && <span className="ml-1.5 text-[#8C6200]">· 0-N/A: {zeroCount}</span>}
          {missing !== undefined && missing > 0 && <span className="ml-1.5 text-amber-700">· missing: {missing}</span>}
        </span>
      </div>
      <div className="w-full h-2.5 bg-[#EFECE2] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const QUALITATIVE_PROBES = [
  { id: 'Q26', short: 'Q26 · Eviction Day & 48h' },
  { id: 'Q27', short: 'Q27 · Daily Survival Struggle' },
  { id: 'Q28', short: 'Q28 · Message to World & Govt' },
] as const;

export const AdminAnalytics: React.FC = () => {
  const { surveys, clusters, documents, logAudit, notify, study } = useAppStore();
  const [clusterFilter, setClusterFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [explorerQId, setExplorerQId] = useState(QUESTIONS[0]?.id ?? 'Q1a');
  const [qualTab, setQualTab] = useState<(typeof QUALITATIVE_PROBES)[number]['id']>('Q26');

  const filtered = useMemo(() => {
    return surveys.filter((s) => {
      if (clusterFilter && s.clusterId !== clusterFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      if (dateFrom && s.profile.surveyDate < dateFrom) return false;
      if (dateTo && s.profile.surveyDate > dateTo) return false;
      return true;
    });
  }, [surveys, clusterFilter, statusFilter, dateFrom, dateTo]);

  const filteredDocs = useMemo(() => {
    const hhIds = new Set(filtered.map((s) => s.householdId));
    return documents.filter((d) => hhIds.has(d.householdId));
  }, [documents, filtered]);

  const total = filtered.length;
  const totalPop = filtered.reduce((sum, s) => sum + s.profile.totalMembers, 0);
  const studyAgg = useMemo(() => aggregateStudyIndices(filtered), [filtered]);
  const hhIndices = useMemo(() => filtered.map((s) => evaluateHouseholdIndices(s)), [filtered]);

  const countAnswer = (qId: string, code: string) =>
    filtered.filter((s) => {
      const n = defaultAnswerNormalizer.normalizeAnswer(qId, s.answers[qId]);
      return !n.is_ambiguous_legacy && !n.is_na && n.option_codes.includes(code);
    }).length;

  const countKey = (qId: string, key: string) =>
    filtered.filter((s) => defaultAnswerNormalizer.normalizeAnswer(qId, s.answers[qId]).option_keys.includes(key)).length;

  const missingQuestionCount = (qId: string) =>
    filtered.filter((s) => defaultAnswerNormalizer.normalizeAnswer(qId, s.answers[qId]).is_missing).length;

  const missingIncomeNow = filtered.filter((s) => !s.profile.incomeNowCode).length;
  const explicitZeroIncomeNow = filtered.filter((s) => s.profile.incomeNowCode === '1').length;
  const femaleHeadedCount = filtered.filter((s) => ['3', '4'].includes(s.profile.headStatusCode)).length;
  const elderlyHeadedCount = filtered.filter((s) => Number(s.profile.headAge || 0) >= 60).length;
  const informalDebtCount = hhIndices.filter((x) => x.tookInformalDebt).length;
  const dueProcessBreachCount = hhIndices.filter((x) => x.dueProcessBreach).length;
  const touziPattaCount = hhIndices.filter((x) => x.hasTouziOrPatta).length;
  const idLostCount = hhIndices.filter((x) => x.idLostOrBuried).length;
  const pdsBlockedCount = hhIndices.filter((x) => x.pdsBlocked).length;
  const landOwnedCount = filtered.filter((s) => s.profile.landOwnedCode === '1').length;

  // B7 community breakdown (top 6 values)
  const topCommunities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of filtered) {
      const name = (s.profile.casteName ?? '').trim() || 'Unspecified';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [filtered]);

  // Q16 women/girls WASH denominator (excludes option 4 Not Applicable)
  const q16ApplicableMissing = filtered.filter((s) => {
    const n = defaultAnswerNormalizer.normalizeAnswer('Q16', s.answers.Q16);
    return n.is_missing || n.is_na;
  }).length;
  const q16NaCount = countKey('Q16', '4');

  const clusterComparison = useMemo(() => {
    return clusters
      .filter((c) => !clusterFilter || c.id === clusterFilter)
      .map((c) => {
        const list = filtered.filter((s) => s.clusterId === c.id);
        const n = list.length;
        const agg = aggregateStudyIndices(list);
        const approved = list.filter((s) => s.status === 'APPROVED').length;
        const zeroCash = list.filter((s) => s.profile.incomeNowCode === '1').length;
        const hungry = list.filter((s) => ['3', '4'].includes(defaultAnswerNormalizer.normalizeAnswer('Q11', s.answers.Q11).option_key ?? '')).length;
        const unsafeWash = list.filter((s) => {
          const n14 = defaultAnswerNormalizer.normalizeAnswer('Q14', s.answers.Q14);
          const n15 = defaultAnswerNormalizer.normalizeAnswer('Q15', s.answers.Q15);
          return n14.semantic_category === 'unsafe_water_deprived' || ['2', '3'].includes(n15.option_key ?? '');
        }).length;
        const missingFields = list.filter((s) => !s.profile.incomeNowCode || !s.answers.Q11).length;
        return {
          id: c.id,
          name: c.name,
          target: c.targetHouseholds,
          n,
          approved,
          mpiPct: agg.mpiHeadcountPct,
          hhsModSevPct: agg.hhsModerateOrSeverePct,
          zeroCashPct: n ? Math.round((zeroCash / n) * 100) : 0,
          hungerPct: n ? Math.round((hungry / n) * 100) : 0,
          washPct: n ? Math.round((unsafeWash / n) * 100) : 0,
          missingCount: missingFields,
        };
      });
  }, [clusters, clusterFilter, filtered]);

  const trendSeries = useMemo(() => {
    const byDate = new Map<string, { date: string; total: number; approved: number }>();
    for (const s of filtered) {
      const d = (s.submittedAt ?? s.profile.surveyDate ?? s.createdAt).slice(0, 10);
      if (!d) continue;
      const cur = byDate.get(d) ?? { date: d, total: 0, approved: 0 };
      cur.total += 1;
      if (s.status === 'APPROVED') cur.approved += 1;
      byDate.set(d, cur);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const indicatorSummaryRows: AnalyticsIndicatorRow[] = useMemo(() => {
    const row = (domain: string, indicator: string, qId: string, hitKeys: string[], zeroKeys: string[] = []): AnalyticsIndicatorRow => {
      const missing = missingQuestionCount(qId);
      const answered = Math.max(0, total - missing);
      const affected = filtered.filter((s) => hitKeys.some((k) => s.answers[qId]?.optionKeys.includes(k))).length;
      const zeroCount = zeroKeys.length
        ? filtered.filter((s) => zeroKeys.some((k) => s.answers[qId]?.optionKeys.includes(k))).length
        : undefined;
      return {
        domain,
        indicator,
        affected,
        answered,
        missing,
        zeroCount,
        pctOfAnswered: answered ? Math.round((affected / answered) * 100) : 0,
      };
    };
    return [
      {
        domain: 'Composite MPI',
        indicator: `UNDP/NITI MPI Headcount H (>=33.3% deprived; M0=${studyAgg.adjustedMpi})`,
        affected: studyAgg.mpiPoorCount,
        answered: studyAgg.mpiEvaluatedCount,
        missing: Math.max(0, total - studyAgg.mpiEvaluatedCount),
        pctOfAnswered: Math.round(studyAgg.mpiHeadcountPct),
      },
      {
        domain: 'Hunger (Q11)',
        indicator: 'Moderate + Severe / Extreme Hunger (Q11 score 2–6)',
        affected: studyAgg.hhsModerate + studyAgg.hhsSevere,
        answered: studyAgg.hhsEvaluatedCount,
        missing: Math.max(0, total - studyAgg.hhsEvaluatedCount),
        zeroCount: studyAgg.hhsLittleOrNo,
        pctOfAnswered: studyAgg.hhsModerateOrSeverePct,
      },
      {
        domain: 'Income (B9)',
        indicator: 'Destitute Income Classification (< Rs.3,000 / mo)',
        affected: explicitZeroIncomeNow,
        answered: Math.max(0, total - missingIncomeNow),
        missing: missingIncomeNow,
        zeroCount: explicitZeroIncomeNow,
        pctOfAnswered: total - missingIncomeNow > 0 ? Math.round((explicitZeroIncomeNow / (total - missingIncomeNow)) * 100) : 0,
      },
      row('Assam Accord', 'Q1a: Living in Assam prior to 24 March 1971 (codes 1–2)', 'Q1a', ['1', '2']),
      row('Due Process', 'Q4: No individual notice or <=7 days advance notice', 'Q4', ['1', '2', '3']),
      row('Displacement', 'Q2b: Displaced 2+ times in lifetime', 'Q2b', ['2', '3', '4']),
      row('MPI Educ (1/6)', 'Q6: Unable to read & write (Adult illiteracy)', 'Q6', ['1']),
      row('MPI Educ (1/6)', 'Q7: Children aged 6–14 out of school', 'Q7', ['2', '3', '4'], ['5']),
      row('MPI Health (1/12)', 'Q9: Underweight / malnourished member', 'Q9', ['2']),
      row('MPI Health (1/6)', 'Q10: <4 ANC or home birth in past 5 yrs', 'Q10', ['2', '3', '4'], ['5']),
      row('MPI Shelter (1/21)', 'Q13: Makeshift tarpaulin / bamboo / open sky', 'Q13', ['2']),
      row('MPI Water (1/21)', 'Q14: Unsafe water or >=30 min walk', 'Q14', ['2', '3']),
      row('MPI Sanit. (1/21)', 'Q15: Shared camp latrine / open defecation', 'Q15', ['2', '3']),
      row('Sphere WASH', 'Q16: Women lack menstrual privacy / safe night toilet', 'Q16', ['2', '3'], ['4']),
      row('MPI Fuel (1/21)', 'Q17: Solid biomass fuel (firewood / dung)', 'Q17', ['2']),
      row('MPI Elec. (1/21)', 'Q18: No electricity access', 'Q18', ['2']),
      row('MPI Bank/Debt (1/21)', 'Q20: No bank account OR took informal debt', 'Q20', ['2', '3']),
      row('Debt Trap', 'Q20: Took new informal loan/debt post-eviction', 'Q20', ['2']),
      row('Livelihood', 'Q22: Unemployed or debt/relief dependent now', 'Q22', ['3', '4']),
      row('Paralegal Need', 'Q24: Identity/NRC/Land docs partially or fully destroyed', 'Q24', ['2', '3']),
      row('Welfare Block', 'Q25b: Welfare benefits blocked by distance/biometrics/lost card', 'Q25b', ['2', '3']),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, total, missingIncomeNow, explicitZeroIncomeNow, studyAgg]);

  const filterLabel =
    [(clusterFilter && (clusters.find((c) => c.id === clusterFilter)?.name ?? clusterFilter)) || 'All Clusters', statusFilter || 'All Statuses', dateFrom && `from ${dateFrom}`, dateTo && `to ${dateTo}`]
      .filter(Boolean)
      .join(' · ');

  const exportAnalyticsXlsx = () => {
    const sheets = buildAnalyticsReportSheets({
      filterLabel,
      totalSurveys: total,
      indicators: indicatorSummaryRows,
      clusterRows: [
        ['Cluster', 'Target', 'Sampled (N)', 'Approved', 'MPI Poor %', 'FAO Mod+Sev Hunger %', 'Zero Income %', 'WASH Deprived %', 'Missing Key Fields'],
        ...clusterComparison.map((c) => [c.name, c.target, c.n, c.approved, `${c.mpiPct}%`, `${c.hhsModSevPct}%`, `${c.zeroCashPct}%`, `${c.washPct}%`, c.missingCount]),
      ],
      trendRows: [['Date', 'Surveys Captured', 'Approved'], ...trendSeries.map((t) => [t.date, t.total, t.approved])],
    });
    const file = downloadXlsx('analytics-report', sheets);
    logAudit('export_analytics_xlsx', 'analytics', 'report', `Exported Analytics workbook (${file})`);
    notify(`Downloaded ${file}`);
  };

  const exportAnalyticsCsv = () => {
    const rows = [
      ['Domain', 'Indicator', 'Affected', 'Answered', 'Missing / Unanswered', 'Explicit Zero / 0-N/A', '% of Answered'],
      ...indicatorSummaryRows.map((r) => [r.domain, r.indicator, r.affected, r.answered, r.missing, r.zeroCount ?? '', `${r.pctOfAnswered}%`]),
    ];
    const file = downloadCsv('analytics-indicators', rows);
    logAudit('export_analytics_csv', 'analytics', 'indicators', `Exported Analytics CSV (${file})`);
    notify(`Downloaded ${file}`);
  };

  const activeFilters = [clusterFilter, statusFilter, dateFrom, dateTo].filter(Boolean).length;
  const exploredQ = QUESTIONS.find((q) => q.id === explorerQId) ?? QUESTIONS[0];
  const exploredTextNotes = exploredQ
    ? filtered
        .map((s) => ({ code: s.surveyCode || 'Draft', head: s.profile.headName, text: (s.answers[exploredQ.id]?.otherText ?? '').trim() }))
        .filter((x) => x.text.length > 0)
    : [];
  const exploredAnsweredCount = exploredQ
    ? filtered.filter((s) => {
        const a = s.answers[exploredQ.id];
        return !!a && (a.optionKeys.length > 0 || a.optionCodes.length > 0 || (a.otherText ?? '').trim().length > 0);
      }).length
    : 0;

  const qualNotes = useMemo(
    () =>
      filtered
        .map((s) => ({
          id: s.id,
          code: s.surveyCode || 'Draft',
          cluster: s.clusterName,
          head: s.profile.headName || 'Unnamed',
          text: (s.answers[qualTab]?.otherText ?? '').trim(),
        }))
        .filter((x) => x.text.length > 0),
    [filtered, qualTab]
  );

  return (
    <AdminLayout
      title="Analytics & Study Indices"
      subtitle="UNDP/NITI Aayog 12-indicator MPI, Household Hunger Scale (Q11), Sphere WASH (Q14–Q16), Assam Accord Settlement (Q1a), and Land/Legal Proof (B10)."
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
            <option value="DRAFT">Draft</option>
            <option value="RETURNED">Returned</option>
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
      </FilterPanel>

      {/* Zero-Coding Hygiene Banner & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-[#E7E2D4] rounded-2xl px-4 py-3 shadow-card">
        <div className="text-xs text-[#5C5547]">
          <strong className="text-[#181611]">Zero-Coding &amp; N/A Safeguard:</strong> Missing / Not-Applicable responses (e.g., <code className="font-mono">Q7=5, Q8=4, Q16=4</code>) never inflate deprivation denominators, while true zero-asset/welfare states (<code className="font-mono">Q19=0, Q25a=0</code>) stay tracked separately.
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={exportAnalyticsCsv}
            disabled={total === 0}
            className="h-9 px-3 rounded-xl border border-[#DFD9C8] bg-white hover:bg-[#FAF8F2] disabled:opacity-50 text-xs font-semibold text-[#181611] inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#8C6200]" /> Export CSV
          </button>
          <button
            type="button"
            onClick={exportAnalyticsXlsx}
            disabled={total === 0}
            className="h-9 px-3 rounded-xl bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-50 text-xs font-semibold text-[#181611] inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Top Executive Composite Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-4 shadow-card">
          <div className="text-xs text-[#726C5D]">Sampled Households / Population</div>
          <div className="text-2xl font-bold text-[#181611] mt-1 tabular-nums">
            {total} HHs <span className="text-base font-semibold text-[#8C6200]">· {totalPop} ppl</span>
          </div>
          <div className="text-[11px] text-[#5C5547] mt-0.5">
            Target N={study.targetSample} · Female-headed: {femaleHeadedCount} · Elderly head: {elderlyHeadedCount}
          </div>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-4 shadow-card">
          <div className="text-xs text-[#726C5D]">UNDP/NITI National MPI (12 Indicators)</div>
          <div className="text-2xl font-bold text-red-700 mt-1 tabular-nums">
            {studyAgg.mpiHeadcountPct}% <span className="text-xs font-semibold text-[#5C5547]">Headcount (H)</span>
          </div>
          <div className="text-[11px] text-[#5C5547] mt-0.5 tabular-nums">
            Intensity (A): {studyAgg.mpiIntensityPct}% · Index (M0): <strong>{studyAgg.adjustedMpi}</strong> · Severe (&ge;50%): {studyAgg.mpiSeverePct}%
          </div>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-4 shadow-card">
          <div className="text-xs text-[#726C5D]">Household Hunger Scale (Q11)</div>
          <div className="text-2xl font-bold text-amber-700 mt-1 tabular-nums">
            {studyAgg.hhsModerateOrSeverePct}% <span className="text-xs font-semibold text-[#5C5547]">Mod+Severe Hunger</span>
          </div>
          <div className="text-[11px] text-[#5C5547] mt-0.5 tabular-nums">
            Severe/Extreme: <strong className="text-red-700">{studyAgg.hhsSevere}</strong> · Moderate: {studyAgg.hhsModerate} · Mean: {studyAgg.meanHhsScore}/6
          </div>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-4 shadow-card">
          <div className="text-xs text-[#726C5D]">Economic &amp; Legal Shock</div>
          <div className="text-2xl font-bold text-red-700 mt-1 tabular-nums">
            {explicitZeroIncomeNow} <span className="text-xs font-semibold text-[#5C5547]">Destitute Income (&lt;₹3k, B9)</span>
          </div>
          <div className="text-[11px] text-[#5C5547] mt-0.5 tabular-nums">
            New Debt (Q20): <strong>{informalDebtCount}</strong> · Notice &le;7d/None: <strong>{dueProcessBreachCount}</strong> · IDs Lost: <strong>{idLostCount}</strong>
          </div>
        </div>
      </div>

      {/* 12-Indicator National MPI Breakdown & Hunger/Morbidity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#181611]">
              UNDP / NITI Aayog National MPI — All 12 Weighted Indicators
            </h2>
            <span className="text-[11px] font-medium text-[#5C5547]">
              Educ 1/6 each · Health 1/6, 1/12, 1/12 · Living Std 1/21 each · Poor if sum &ge; 33.3%
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
            {studyAgg.mpiIndicators.map((ind) => (
              <BarRow
                key={ind.qId}
                label={`${ind.qId} [${ind.weightLabel}] ${ind.label}`}
                count={ind.deprived}
                total={total}
                missing={ind.missing}
                zeroCount={ind.zeroNa}
                color={
                  ind.dimension === 'Education'
                    ? 'bg-[#2563EB]'
                    : ind.dimension === 'Health & Nutrition'
                      ? 'bg-red-600'
                      : 'bg-[#FDC513]'
                }
              />
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">
            Food Scarcity (Q11) &amp; Camp Morbidity (Q12a/Q12b)
          </h2>
          <BarRow label="Severe / Extreme Hunger (Q11: 3 or 4)" count={studyAgg.hhsSevere} total={studyAgg.hhsEvaluatedCount || total} color="bg-red-700" />
          <BarRow label="Moderate Scarcity (Q11: 2)" count={studyAgg.hhsModerate} total={studyAgg.hhsEvaluatedCount || total} color="bg-amber-600" />
          <BarRow label="Adequate Food (Q11: 1)" count={studyAgg.hhsLittleOrNo} total={studyAgg.hhsEvaluatedCount || total} color="bg-[#FDC513]" />
          <div className="pt-2 border-t border-[#E7E2D4] space-y-2">
            <div className="text-xs font-semibold text-[#726C5D]">Camp Illness (Q12a) &amp; Care Access (Q12b)</div>
            <BarRow label="Q12a: Fever / cough / cold" count={countAnswer('Q12a', '1')} total={total} missing={missingQuestionCount('Q12a')} color="bg-amber-500" />
            <BarRow label="Q12a: Diarrhoea / stomach infection" count={countAnswer('Q12a', '2')} total={total} missing={missingQuestionCount('Q12a')} color="bg-red-500" />
            <BarRow label="Q12b: Private out-of-pocket OR unable to afford" count={countAnswer('Q12b', '3') + countAnswer('Q12b', '4')} total={total} missing={missingQuestionCount('Q12b')} color="bg-red-600" />
          </div>
        </div>
      </div>

      {/* Main Analytics Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 1. Cluster Completion & Distribution */}
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">
            Cluster / Relief Camp Sample Progress
          </h2>
          {clusters.map((c) => {
            const count = filtered.filter((s) => s.clusterId === c.id).length;
            return (
              <BarRow
                key={c.id}
                label={`${c.name} (Target ${c.targetHouseholds})`}
                count={count}
                total={c.targetHouseholds}
              />
            );
          })}
        </div>

        {/* 2. Demographics, Communities & Land Ownership (B7, B10) */}
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">
            Social Profile, Communities &amp; Landholding (B7, B10)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#726C5D]">Official Caste Category (B7)</div>
              {PART1_OPTIONS.b7CasteCategory.map((opt) => (
                <BarRow
                  key={opt.key}
                  label={opt.en}
                  count={filtered.filter((s) => s.profile.casteCategoryCode === opt.code).length}
                  total={total}
                />
              ))}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#726C5D]">Top Specific Communities (B7) &amp; Land (B10)</div>
              {topCommunities.map(([name, cnt]) => (
                <BarRow key={name} label={name} count={cnt} total={total} color="bg-[#2D69B3]" />
              ))}
              <BarRow label="Land Owned (B10a = Yes)" count={landOwnedCount} total={total} color="bg-[#FDC513]" />
              <BarRow label="Holds Patta / Forest / Touzi (B10c)" count={touziPattaCount} total={total} color="bg-amber-600" />
            </div>
          </div>
        </div>

        {/* 3. Post-Eviction Income Brackets & District Distribution (B9 & B1) */}
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-4">
          <h2 className="text-sm font-bold text-[#181611]">
            Monthly Income Brackets (B9) &amp; Top Districts (B1)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-[#8C6200]">Post-Eviction Income Tiers (B9 · missing {missingIncomeNow})</div>
              {PART1_OPTIONS.b9Income.map((opt) => (
                <BarRow
                  key={opt.code}
                  label={opt.en}
                  count={filtered.filter((s) => s.profile.incomeNowCode === opt.code).length}
                  total={total}
                  missing={missingIncomeNow}
                  color={opt.code === '1' ? 'bg-red-600' : 'bg-[#F4C928]'}
                />
              ))}
            </div>
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-[#5C5547]">Assam Districts Sampled (B1)</div>
              {PART1_OPTIONS.b1Districts
                .filter((d) => filtered.some((s) => s.profile.districtCode === d.code))
                .slice(0, 6)
                .map((d) => (
                  <BarRow
                    key={d.code}
                    label={d.en}
                    count={filtered.filter((s) => s.profile.districtCode === d.code).length}
                    total={total}
                    color="bg-[#2D69B3]"
                  />
                ))}
            </div>
          </div>
        </div>

        {/* 4. Settlement History, Due Process & Education / ICDS (Q1a–Q8) */}
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">
            Settlement Proof (Q1–Q4) &amp; Schooling / ICDS Disruption (Q7–Q8)
          </h2>
          <BarRow label="Q1a: Pre-1971 Assam settlement (1 & 2)" count={countAnswer('Q1a', '1') + countAnswer('Q1a', '2')} total={total} missing={missingQuestionCount('Q1a')} color="bg-[#217045]" />
          <BarRow label="Q2b: Displaced 2+ times in lifetime" count={countAnswer('Q2b', '2') + countAnswer('Q2b', '3') + countAnswer('Q2b', '4')} total={total} missing={missingQuestionCount('Q2b')} color="bg-amber-600" />
          <BarRow label="Q4: No individual notice received" count={countAnswer('Q4', '1')} total={total} missing={missingQuestionCount('Q4')} color="bg-red-700" />
          <BarRow label="Q4: <= 7 days advance notice (2 & 3)" count={countAnswer('Q4', '2') + countAnswer('Q4', '3')} total={total} missing={missingQuestionCount('Q4')} color="bg-red-500" />
          <BarRow label="Q7: Children 6–14 out of school (2, 3 & 4)" count={countAnswer('Q7', '2') + countAnswer('Q7', '3') + countAnswer('Q7', '4')} total={total} missing={missingQuestionCount('Q7')} color="bg-[#F4C928]" />
          <BarRow label="Q8: ICDS Anganwadi stopped post-eviction" count={countAnswer('Q8', '2')} total={total} missing={missingQuestionCount('Q8')} color="bg-amber-600" />
        </div>

        {/* 5. Shelter, WASH & Debt Trap (Q13–Q20) */}
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">
            Shelter, Sphere WASH &amp; Bank / Debt Trap (Q13–Q20)
          </h2>
          <BarRow label="Q13: Makeshift tarpaulin / bamboo / open sky" count={countAnswer('Q13', '2')} total={total} missing={missingQuestionCount('Q13')} color="bg-red-600" />
          <BarRow label="Q15: Open defecation / pit OR shared camp toilet" count={countAnswer('Q15', '2') + countAnswer('Q15', '3')} total={total} missing={missingQuestionCount('Q15')} color="bg-amber-600" />
          <BarRow label="Q16 Sphere WASH: Wait until dark & lack pads" count={countAnswer('Q16', '3')} total={total} missing={q16ApplicableMissing} zeroCount={q16NaCount} color="bg-red-600" />
          <BarRow label="Q16 Sphere WASH: Pads/cloth but no private enclosure" count={countAnswer('Q16', '2')} total={total} missing={q16ApplicableMissing} zeroCount={q16NaCount} color="bg-amber-600" />
          <BarRow label="Q20: Bank account + NEW informal debt" count={informalDebtCount} total={total} missing={missingQuestionCount('Q20')} color="bg-purple-600" />
          <BarRow label="Q20: No active bank/post office account" count={countAnswer('Q20', '3')} total={total} missing={missingQuestionCount('Q20')} color="bg-red-700" />
        </div>

        {/* 6. Livelihood Shift, Documents Lost & Welfare Schemes (Q21–Q25b) */}
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">
            Livelihoods, Asset Loss &amp; Welfare Scheme Barriers (Q21–Q25b)
          </h2>
          <BarRow label="Q21 Pre-Eviction: Own cultivation / livestock (1 & 2)" count={countAnswer('Q21', '1') + countAnswer('Q21', '2')} total={total} missing={missingQuestionCount('Q21')} color="bg-[#2D69B3]" />
          <BarRow label="Q22 Now: Unemployed OR credit/NGO dependent (3 & 4)" count={countAnswer('Q22', '3') + countAnswer('Q22', '4')} total={total} missing={missingQuestionCount('Q22')} color="bg-red-600" />
          <BarRow label="Q24 Paralegal Need: Documents lost or buried (2 & 3)" count={idLostCount} total={total} missing={missingQuestionCount('Q24')} color="bg-red-600" />
          <BarRow label="Q25a: Receiving zero government schemes right now" count={countKey('Q25a', '7')} total={total} missing={missingQuestionCount('Q25a')} color="bg-red-700" />
          <BarRow label="Q25b: Welfare benefits blocked (distance/dealer/card/bio)" count={pdsBlockedCount} total={total} missing={missingQuestionCount('Q25b')} color="bg-amber-600" />
        </div>
      </div>

      {/* Document Verification & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">Document Verification &amp; Legal Archive Completeness</h2>
          <BarRow
            label="Verified Documents"
            count={filteredDocs.filter((d) => d.verificationStatus === 'VERIFIED').length}
            total={Math.max(1, filteredDocs.length)}
          />
          <BarRow
            label="Pending Verification"
            count={filteredDocs.filter((d) => d.verificationStatus === 'PENDING').length}
            total={Math.max(1, filteredDocs.length)}
            color="bg-[#F4C928]"
          />
          <BarRow
            label="Households with >=1 Verified Document"
            count={filtered.filter((s) => documents.some((d) => d.householdId === s.householdId && d.verificationStatus === 'VERIFIED')).length}
            total={total}
            color="bg-[#2D69B3]"
          />
          <BarRow
            label="B2 Aadhaar Verified (Trailing 4 digits stored only)"
            count={filtered.filter((s) => hasDocVerifiedCode(s.profile.docVerifiedCode, '1')).length}
            total={total}
            color="bg-[#FDC513]"
          />
          <BarRow
            label="B2 All IDs Lost in Eviction"
            count={filtered.filter((s) => hasDocVerifiedCode(s.profile.docVerifiedCode, '0')).length}
            total={total}
            color="bg-red-600"
          />
        </div>
      </div>

      {/* Part III: Qualitative Open-Ended Testimonies (Q26–Q28) */}
      <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#181611]">Open-Ended Testimonies &amp; Resilience (Q26–Q28)</h2>
            <p className="text-xs text-[#726C5D] mt-0.5">Recorded verbatim narratives from Part III of the Assam Evicted Households questionnaire.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUALITATIVE_PROBES.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setQualTab(tab.id)}
                className={`h-8 px-3 rounded-full text-xs font-semibold border transition ${
                  qualTab === tab.id
                    ? 'bg-[#FDC513] text-[#181611] border-[#D9AE00]'
                    : 'bg-[#FAF8F2] text-[#4A4336] border-[#E7E2D4] hover:bg-[#FFF8D6]'
                }`}
              >
                {tab.short}
              </button>
            ))}
          </div>
        </div>
        {qualNotes.length === 0 ? (
          <p className="text-xs text-[#726C5D] py-4 text-center">No text narratives recorded for {qualTab} in the current filter.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            {qualNotes.map((n) => (
              <div key={n.id} className="rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[#8C6200]">
                  <span>{n.code} · {n.head}</span>
                  <span className="text-[#726C5D]">{n.cluster}</span>
                </div>
                <p className="text-xs text-[#181611] leading-relaxed">{n.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cluster Comparison & Completion Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3 overflow-x-auto">
          <h2 className="text-sm font-bold text-[#181611]">Cluster Comparison Matrix</h2>
          <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
              <tr className="border-b border-[#E7E2D4] text-[#726C5D]">
                <th className="py-2 font-semibold">Cluster</th>
                <th className="py-2 text-right font-semibold">Sample / Target</th>
                <th className="py-2 text-right font-semibold">MPI Poor %</th>
                <th className="py-2 text-right font-semibold">Mod+Sev Hunger</th>
                <th className="py-2 text-right font-semibold">₹0 Income</th>
                <th className="py-2 text-right font-semibold">WASH Deprived</th>
                <th className="py-2 text-right font-semibold">Missing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE2]">
              {clusterComparison.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 font-semibold text-[#181611]">{c.name}</td>
                  <td className="py-2 text-right tabular-nums">{c.n}/{c.target}</td>
                  <td className="py-2 text-right tabular-nums font-semibold text-red-700">{c.mpiPct}%</td>
                  <td className="py-2 text-right tabular-nums text-amber-700">{c.hhsModSevPct}%</td>
                  <td className="py-2 text-right tabular-nums text-red-700">{c.zeroCashPct}%</td>
                  <td className="py-2 text-right tabular-nums text-[#181611]">{c.washPct}%</td>
                  <td className="py-2 text-right tabular-nums text-[#726C5D]">{c.missingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-3">
          <h2 className="text-sm font-bold text-[#181611]">Survey Completion Trends</h2>
          {trendSeries.length === 0 ? (
            <p className="text-xs text-[#726C5D] py-6 text-center">No surveys in selected date window.</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {trendSeries.slice(-14).map((t) => (
                <BarRow key={t.date} label={`${t.date} (${t.approved} approved)`} count={t.total} total={Math.max(1, ...trendSeries.map((x) => x.total))} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Question-Level Explorer */}
      {exploredQ && (
        <div className="bg-white border border-[#E7E2D4] rounded-2xl p-5 shadow-card space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#181611]">Question-Level Explorer (Q1a–Q28)</h2>
              <p className="text-xs text-[#726C5D] mt-0.5">
                {exploredQ.sectionTitleEn} &bull; {exploredQ.source} ({exploredQ.indicator})
              </p>
            </div>
            <select
              aria-label="Select question to explore"
              value={exploredQ.id}
              onChange={(e) => setExplorerQId(e.target.value)}
              className="w-full md:w-96 min-h-[40px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs font-semibold text-[#181611]"
            >
              {QUESTIONS.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.id} — {q.en}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl bg-[#FAF8F2] border border-[#E7E2D4] px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#181611]">{exploredQ.en}</span>
            <span className="text-[#8C6200] font-bold tabular-nums">
              Answered: {exploredAnsweredCount} / {total} ({total > 0 ? Math.round((exploredAnsweredCount / total) * 100) : 0}%)
            </span>
          </div>

          {exploredQ.options && exploredQ.options.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
              {exploredQ.options.map((opt) => {
                const count = filtered.filter((s) => {
                  const n = defaultAnswerNormalizer.normalizeAnswer(exploredQ.id, s.answers[exploredQ.id]);
                  return !n.is_ambiguous_legacy && n.option_keys.includes(opt.key);
                }).length;
                return (
                  <BarRow
                    key={opt.key}
                    label={`[${opt.key} · code:${opt.code}] ${opt.en}${opt.tag ? ` · ${opt.tag}` : ''}`}
                    count={count}
                    total={total}
                  />
                );
              })}
            </div>
          )}

          {exploredTextNotes.length > 0 && (
            <div className="pt-2 border-t border-[#E7E2D4] space-y-2">
              <div className="text-xs font-semibold text-[#726C5D]">
                Recorded Text / Other Responses ({exploredTextNotes.length})
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {exploredTextNotes.slice(0, 8).map((n, i) => (
                  <li key={i} className="rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 py-2">
                    <span className="font-bold text-[#8C6200]">{n.code}</span>{' '}
                    <span className="text-[#726C5D]">({n.head}):</span>{' '}
                    <span className="text-[#181611]">{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
};

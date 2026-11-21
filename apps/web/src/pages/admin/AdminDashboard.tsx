import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { DocumentPreview } from '../../components/ui/DocumentPreview';
import { KpiCards } from '../../components/dashboard/KpiCards';
import { ClusterProgress } from '../../components/dashboard/ClusterProgress';
import { CoverageMap } from '../../components/dashboard/CoverageMap';
import { SurveyTrend } from '../../components/dashboard/SurveyTrend';
import { KeyIndicators } from '../../components/dashboard/KeyIndicators';
import { RecentSurveys, SurveyTab } from '../../components/dashboard/RecentSurveys';
import { QuickActions, RecentActivity, RecentDocuments } from '../../components/dashboard/RightRail';
import { dayLabel } from '../../components/dashboard/format';
import type { ClusterStat, Indicator, TrendPoint } from '../../components/dashboard/types';
import { decisionsFor, HouseholdDetailDrawer } from './HouseholdDetailDrawer';
import { QualityInsightsPanel } from './QualityInsightsPanel';
import { VolunteerLocationsPanel } from '../../components/dashboard/VolunteerLocationsPanel';
import { useAppStore } from '../../store/appStore';
import { aggregateStudyIndices, evaluateHouseholdIndices } from '@m2s/shared/utils/studyIndicators';
import { defaultAnswerNormalizer } from '@m2s/shared/validation';
import type { HouseholdDocument, SurveyRecord } from '../../types/survey';

const TREND_DAYS = 9;
const isDraft = (s: SurveyRecord) => s.status === 'DRAFT' || s.status === 'PENDING_SYNC';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { surveys, clusters, documents, users, auditLogs, reviewSurvey, notify, downloadDocument, study, currentUser } = useAppStore();

  const [tab, setTab] = useState<SurveyTab>('ALL');
  const [clusterFilter, setClusterFilter] = useState<string | null>(null);
  const [openSurvey, setOpenSurvey] = useState<SurveyRecord | null>(null);
  const [previewDoc, setPreviewDoc] = useState<HouseholdDocument | null>(null);

  /* ---------- KPIs ---------- */
  const approved = useMemo(() => surveys.filter((s) => s.status === 'APPROVED'), [surveys]);
  const submittedCount = surveys.filter((s) => s.status === 'SUBMITTED').length;
  const draftCount = surveys.filter(isDraft).length;
  const activeVolunteers = users.filter((u) => u.role === 'VOLUNTEER' && u.active).length;
  const target = Math.max(
    study.targetSample,
    clusters.filter((c) => c.active).reduce((sum, c) => sum + c.targetHouseholds, 0)
  );

  /* ---------- Cluster progress + map coverage ---------- */
  const clusterStats: ClusterStat[] = useMemo(
    () =>
      clusters
        .filter((c) => c.active)
        .map((c) => {
          const done = approved.filter((s) => s.clusterId === c.id).length;
          const submitted = surveys.filter((s) => s.clusterId === c.id && s.status === 'SUBMITTED').length;
          const pct = c.targetHouseholds > 0 ? Math.min(100, Math.round((done / c.targetHouseholds) * 100)) : 0;
          // Pending = review backlog is large relative to what is already approved.
          const coverage: ClusterStat['coverage'] =
            done === 0 && submitted === 0 ? 'empty' : submitted * 2 >= done ? 'pending' : 'completed';
          return { ...c, done, submitted, pct, coverage };
        }),
    [clusters, surveys, approved]
  );

  /* ---------- Trend: cumulative completed surveys over the last N survey days ---------- */
  const trend: TrendPoint[] = useMemo(() => {
    const dates = approved.map((s) => s.profile.surveyDate.slice(0, 10)).filter(Boolean).sort();
    if (dates.length === 0) return [];
    const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);
    const days = Array.from({ length: TREND_DAYS }, (_, i) => {
      const d = new Date(last);
      d.setUTCDate(d.getUTCDate() - (TREND_DAYS - 1 - i));
      return d.toISOString().slice(0, 10);
    });
    return days.map((day) => ({ label: dayLabel(day), count: dates.filter((d) => d <= day).length }));
  }, [approved]);

  /* ---------- Key indicators (computed from completed/approved households using MPI & FAO HHS) ---------- */
  const indicators: Indicator[] = useMemo(() => {
    const n = approved.length;
    const agg = aggregateStudyIndices(approved);
    const evals = approved.map((s) => evaluateHouseholdIndices(s));
    const share = (pred: (s: SurveyRecord, i: number) => boolean) =>
      n === 0 ? 0 : Math.round((approved.filter(pred).length / n) * 100);
    const sem = (s: SurveyRecord, q: string) => defaultAnswerNormalizer.normalizeAnswer(q, s.answers[q]);
    const hasKey = (s: SurveyRecord, q: string, key: string) => sem(s, q).option_keys.includes(key);
    return [
      { label: 'MPI Poor (>=33%)', range: '12 MPI items', color: '#FDC513', pct: Math.round(agg.mpiHeadcountPct) },
      { label: 'Mod+ Hunger (Q11)', range: 'Q11 Food Scale', color: '#D9534F', pct: agg.hhsModerateOrSeverePct },
      {
        label: 'Shelter / WASH Deprived',
        range: 'Q13–Q16 Sphere',
        color: '#E59500',
        pct: share((s) => sem(s, 'Q13').semantic_category === 'makeshift_tent_open_sky_deprived' || hasKey(s, 'Q15', '3') || hasKey(s, 'Q16', '3')),
      },
      {
        label: 'Livelihood / Debt',
        range: 'B9, Q20, Q22',
        color: '#181611',
        pct: share((s, i) => evals[i].zeroCashIncome || evals[i].tookInformalDebt || hasKey(s, 'Q22', '4')),
      },
    ];
  }, [approved]);

  /* ---------- Recent surveys table ---------- */
  const tableRows = useMemo(
    () =>
      surveys
        .filter((s) => !clusterFilter || s.clusterId === clusterFilter)
        .filter((s) =>
          tab === 'ALL' ? true : tab === 'DRAFT' ? isDraft(s) : s.status === tab
        )
        .slice(0, 4),
    [surveys, tab, clusterFilter]
  );
  const filterName = clusterFilter ? clusters.find((c) => c.id === clusterFilter)?.name : null;

  /* ---------- Actions ---------- */
  const downloadDoc = (doc: HouseholdDocument) =>
    downloadDocument(doc).then(() => notify(`Downloaded ${doc.docType} (${doc.surveyCode})`)).catch(() => undefined);

  const review = async (id: string, decision: 'APPROVE' | 'RETURN') => {
    const code = surveys.find((s) => s.id === id)?.surveyCode ?? 'Survey';
    try {
      await reviewSurvey(id, decision, decision === 'APPROVE' ? 'Approved from dashboard.' : 'Returned from dashboard for corrections.');
      notify(decision === 'APPROVE' ? `${code} approved.` : `${code} returned to the volunteer.`);
    } catch {
      /* store already showed the error */
    }
  };

  return (
    <AdminLayout title="Dashboard" subtitle="Overview of the field survey, households, documents and progress.">
      <KpiCards
        target={target}
        completed={approved.length}
        pendingReview={submittedCount}
        drafts={draftCount}
        activeVolunteers={activeVolunteers}
        onNavigate={navigate}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_372px] items-start">
        {/* Main column */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 min-w-0">
          <ClusterProgress
            clusters={clusterStats}
            selectedId={clusterFilter}
            onSelect={setClusterFilter}
            onViewAll={() => navigate('/admin/clusters')}
          />
          <CoverageMap clusters={clusterStats} selectedId={clusterFilter} onSelect={setClusterFilter} surveys={surveys} onSelectSurvey={setOpenSurvey} users={users} />
          <SurveyTrend points={trend} />
          <KeyIndicators indicators={indicators} onOpen={() => navigate('/admin/analytics')} />
          <div className="lg:col-span-2 min-w-0">
            <RecentSurveys
              surveys={tableRows}
              documents={documents}
              counts={{ submitted: submittedCount, approved: approved.length, drafts: draftCount }}
              tab={tab}
              onTab={setTab}
              onOpen={setOpenSurvey}
              onReview={review}
              canDecide={(s, d) => decisionsFor(currentUser.role, s.status).includes(d)}
              onViewAll={() => navigate('/admin/surveys')}
              filterNote={
                filterName && (
                  <div className="px-4 py-2 bg-[#FFFDF4] border-b border-[#E7E2D4] flex items-center gap-2 text-[12.5px] text-[#181611]">
                    Showing <strong className="font-semibold">{filterName}</strong> only
                    <button
                      type="button"
                      onClick={() => setClusterFilter(null)}
                      className="ml-1 inline-flex items-center gap-1 text-[#8C6200] font-semibold hover:underline"
                    >
                      <X className="w-3.5 h-3.5" /> Clear
                    </button>
                  </div>
                )
              }
            />
          </div>
        </div>

        {/* Right rail */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 min-w-0">
          <RecentDocuments
            documents={documents.slice(0, 4)}
            onPreview={setPreviewDoc}
            onDownload={downloadDoc}
            onViewAll={() => navigate('/admin/documents')}
          />
          <QuickActions onNavigate={navigate} />
          <div className="md:col-span-2 xl:col-span-1">
            <RecentActivity events={auditLogs.slice(0, 3)} onViewAll={() => navigate('/admin/audit')} />
          </div>
        </div>
      </div>

      <div className="mt-5">
        <VolunteerLocationsPanel
          users={users}
          surveys={surveys}
          onOpenSurvey={(s) => setOpenSurvey(s)}
          onViewAllVolunteers={() => navigate('/admin/volunteers')}
        />
      </div>

      <div className="mt-5">
        <QualityInsightsPanel
          onOpenSurvey={(surveyId) => setOpenSurvey(surveys.find((s) => s.id === surveyId) ?? null)}
          onOpenFullInsights={() => navigate('/admin/reviews?tab=insights')}
        />
      </div>

      <HouseholdDetailDrawer
        survey={openSurvey}
        onClose={() => setOpenSurvey(null)}
        onPreviewDocument={setPreviewDoc}
      />
      <DocumentPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </AdminLayout>
  );
};

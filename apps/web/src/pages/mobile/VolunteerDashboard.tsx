import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  FileText,
  MapPin,
  Plus,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { VolunteerLayout } from '../../components/layout/VolunteerLayout';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { relativeTime } from '../../components/dashboard/format';
import { useAppStore } from '../../store/appStore';
import { SessionGpsBanner } from '@m2s/shared/components/SessionGpsBanner';
import type { SurveyRecord, SurveyStatus } from '../../types/survey';

const card = 'bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.05)]';

/** Latest RETURN review (by createdAt). */
function latestReturn(s: SurveyRecord) {
  return [...(s.reviews ?? [])]
    .filter((r) => r.decision === 'RETURN')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

const STATUS_ROWS: { status: SurveyStatus; label: string; dot: string }[] = [
  { status: 'DRAFT', label: 'Drafts', dot: 'bg-[#9E9683]' },
  { status: 'PENDING_SYNC', label: 'Unsynced', dot: 'bg-[#E0A21B]' },
  { status: 'SUBMITTED', label: 'Submitted', dot: 'bg-[#C77A0A]' },
  { status: 'RETURNED', label: 'Returned', dot: 'bg-[#C93B32]' },
  { status: 'APPROVED', label: 'Approved', dot: 'bg-[#D4A100]' },
  { status: 'REJECTED', label: 'Rejected', dot: 'bg-[#8E2A24]' },
];

export const VolunteerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    clusters,
    surveys,
    language,
    setLanguage,
    notifications,
    markNotificationsRead,
    isOnline,
    pendingCount,
    syncState,
    syncPendingSurveys,
    notify,
    deviceGps,
    gpsState,
    refreshLocationPing,
  } = useAppStore();
  const hi = language === 'hi';
  const [syncing, setSyncing] = useState(false);

  const mySurveys = useMemo(() => surveys.filter((s) => s.volunteerId === currentUser.id), [surveys, currentUser.id]);
  const clusterNames = clusters.filter((c) => currentUser.assignedClusterIds.includes(c.id)).map((c) => c.name);

  const counts = useMemo(() => {
    const c: Record<SurveyStatus, number> = { DRAFT: 0, PENDING_SYNC: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 0, REJECTED: 0 };
    mySurveys.forEach((s) => (c[s.status] += 1));
    return c;
  }, [mySurveys]);

  const completed = counts.SUBMITTED + counts.APPROVED + counts.PENDING_SYNC;
  const target = currentUser.targetHouseholds ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;

  const returned = useMemo(
    () =>
      mySurveys
        .filter((s) => s.status === 'RETURNED')
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [mySurveys]
  );
  const drafts = useMemo(
    () =>
      mySurveys
        .filter((s) => s.status === 'DRAFT')
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 3),
    [mySurveys]
  );
  const unread = notifications.filter((n) => n.unread).length;
  const firstName = currentUser.name.split(' ')[0] || 'there';

  const runSync = async () => {
    setSyncing(true);
    try {
      const n = await syncPendingSurveys();
      if (isOnline) notify(`Synced ${n} item${n === 1 ? '' : 's'}`);
    } catch {
      /* store already toasted */
    } finally {
      setSyncing(false);
    }
  };

  return (
    <VolunteerLayout>
      {/* Greeting */}
      <header
        className="bg-[#FDC513] text-[#181611] px-5 pb-6"
        style={{ paddingTop: 'max(20px, calc(env(safe-area-inset-top) + 12px))' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12.5px] text-[#181611]/70 font-medium">{hi ? 'नमस्ते' : 'Welcome back'}</p>
            <h1 className="text-[21px] font-bold tracking-tight mt-0.5 truncate">
              {hi ? `${firstName} जी` : `Hello, ${firstName}`}
            </h1>
          </div>
          <div className="bg-white rounded-xl border border-[#181611]/10 shrink-0">
            <LanguageToggle language={language} onChange={setLanguage} compact />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {clusterNames.length ? (
            clusterNames.map((n) => (
              <span
                key={n}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#181611]/10 border border-[#181611]/15 text-[12px] font-semibold text-[#181611]"
              >
                <MapPin className="w-3.5 h-3.5 text-[#181611]" />
                {n}
              </span>
            ))
          ) : (
            <span className="text-[12.5px] text-[#181611]/75">No clusters assigned yet. Contact your admin.</span>
          )}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4 flex-1">
        {/* Automatic GPS status banner */}
        <SessionGpsBanner gpsState={gpsState} deviceGps={deviceGps} hi={hi} onRefresh={() => refreshLocationPing(true)} />

        {/* Start new survey */}
        <button
          type="button"
          onClick={() => navigate('/volunteer/surveys/new')}
          className="w-full h-12 rounded-[10px] bg-[#181611] hover:bg-[#2C281F] text-[#FDC513] text-[15px] font-semibold inline-flex items-center justify-center gap-2 shadow-[0_4px_12px_-4px_rgba(24,22,17,0.35)] transition"
        >
          <Plus className="w-5 h-5" />
          {hi ? 'नया सर्वे शुरू करें' : 'Start new survey'}
        </button>

        {/* Progress */}
        <section className={`${card} p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[14px] font-semibold text-[#181611]">{hi ? 'मेरी प्रगति' : 'My progress'}</h2>
              <p className="text-[12.5px] text-[#726C5D] mt-0.5">
                {target > 0 ? `${completed} of ${target} households completed` : `${completed} households completed (no target set)`}
              </p>
            </div>
            {target > 0 && <span className="text-[22px] font-bold text-[#8C6200] leading-none">{pct}%</span>}
          </div>
          {target > 0 && (
            <div className="mt-3 h-2 rounded-full bg-[#EFECE2] overflow-hidden">
              <div className="h-full rounded-full bg-[#FDC513] transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 min-[360px]:grid-cols-3 gap-2">
            {STATUS_ROWS.map((r) => (
              <Link
                key={r.status}
                to={`/volunteer/surveys?status=${r.status}`}
                className="rounded-[10px] bg-[#FAF8F2] border border-[#EBE6D8] px-2.5 py-2 hover:border-[#D9AE00] transition"
              >
                <div className="flex items-center gap-1.5 text-[11.5px] text-[#5C5547] font-medium">
                  <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                  {r.label}
                </div>
                <div className="text-[18px] font-bold text-[#181611] mt-0.5">{counts[r.status]}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Returned surveys */}
        {returned.length > 0 && (
          <section className={`${card} overflow-hidden border-[#F2C9C5]`}>
            <div className="px-4 py-3 bg-[#FDF3F2] border-b border-[#F2C9C5] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C93B32]" />
              <h2 className="text-[14px] font-semibold text-[#8E2A24]">
                {hi ? 'सुधार की ज़रूरत' : 'Needs your fixes'} ({returned.length})
              </h2>
            </div>
            <ul className="divide-y divide-[#EFECE2]">
              {returned.map((s) => {
                const r = latestReturn(s);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/volunteer/surveys/${s.id}`)}
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[#FAF8F2] transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#181611] truncate">
                          {s.profile.headName || 'Unnamed household'}
                          <span className="font-normal text-[#726C5D]"> · {s.surveyCode || 'Not yet synced'}</span>
                        </div>
                        <p className="text-[12.5px] text-[#C93B32] mt-1 leading-snug line-clamp-2">
                          {r ? r.reason : 'Returned by reviewer.'}
                        </p>
                        {r && (
                          <p className="text-[11.5px] text-[#726C5D] mt-1">
                            {r.reviewerName} · {relativeTime(r.createdAt)}
                          </p>
                        )}
                      </div>
                      <span className="text-[12.5px] font-semibold text-[#8C6200] shrink-0 inline-flex items-center gap-0.5 mt-0.5">
                        Fix <ChevronRight className="w-4 h-4" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Sync status */}
        <section className={`${card} p-4`}>
          <div className="flex items-center gap-3">
            <span
              className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${
                isOnline ? 'bg-[#FFF8D6] text-[#8C6200]' : 'bg-[#FFF5E0] text-[#B26B00]'
              }`}
            >
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-[#181611]">
                {isOnline ? 'Online' : 'Offline'}
                {pendingCount > 0 && (
                  <span className="ml-2 text-[12px] font-semibold text-[#9A6800]">{pendingCount} waiting to sync</span>
                )}
              </div>
              <p className="text-[12px] text-[#726C5D] mt-0.5 truncate">
                {syncState.lastSyncAt ? `Last synced ${relativeTime(syncState.lastSyncAt)}` : 'No sync yet this session'}
              </p>
            </div>
            {pendingCount > 0 && isOnline ? (
              <button
                type="button"
                onClick={runSync}
                disabled={syncing || syncState.running}
                className="h-10 px-3.5 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-60 text-[#181611] text-[13px] font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-4 h-4 ${syncing || syncState.running ? 'animate-spin' : ''}`} />
                Sync
              </button>
            ) : (
              <Link
                to="/volunteer/sync"
                className="h-10 px-3 rounded-[10px] border border-[#E7E2D4] text-[13px] font-semibold text-[#181611] inline-flex items-center gap-1 hover:bg-[#FAF8F2]"
              >
                <CloudUpload className="w-4 h-4 text-[#8C6200]" />
                Details
              </Link>
            )}
          </div>
          {syncState.lastError && (
            <p className="mt-3 text-[12px] text-[#C93B32] bg-[#FDECEA] rounded-[8px] px-2.5 py-1.5">{syncState.lastError}</p>
          )}
        </section>

        {/* Recent drafts */}
        <section className={card}>
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#181611]">{hi ? 'हाल के ड्राफ़्ट' : 'Recent drafts'}</h2>
            <Link to="/volunteer/surveys?status=DRAFT" className="text-[12.5px] font-semibold text-[#8C6200] hover:underline">
              View all
            </Link>
          </div>
          {drafts.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-[#726C5D]">No drafts in progress.</p>
          ) : (
            <ul className="divide-y divide-[#EFECE2] border-t border-[#EFECE2]">
              {drafts.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/volunteer/surveys/${s.id}`)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[#FAF8F2] transition"
                  >
                    <span className="w-9 h-9 rounded-[10px] bg-[#EFECE2] text-[#5C5547] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13.5px] font-semibold text-[#181611] truncate">
                        {s.profile.headName || 'Unnamed household'}
                      </span>
                      <span className="block text-[12px] text-[#726C5D] truncate">
                        {s.clusterName || 'No cluster'} · edited {relativeTime(s.updatedAt)}
                      </span>
                    </span>
                    <StatusBadge status={s.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Notifications */}
        <section className={card}>
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#181611] inline-flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#8C6200]" />
              {hi ? 'सूचनाएँ' : 'Notifications'}
              {unread > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#FDC513] text-[#181611] text-[11px] font-bold inline-flex items-center justify-center">
                  {unread}
                </span>
              )}
            </h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markNotificationsRead().catch(() => undefined)}
                className="text-[12.5px] font-semibold text-[#8C6200] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-[#726C5D] inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#8C6200]" />
              You are all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-[#EFECE2] border-t border-[#EFECE2]">
              {notifications.slice(0, 6).map((n) => {
                const linkable = n.linkTo && n.linkTo.startsWith('/volunteer');
                const body = (
                  <>
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.unread ? 'bg-[#FDC513]' : 'bg-transparent'}`}
                      aria-hidden="true"
                    />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-[13px] leading-snug ${n.unread ? 'font-semibold text-[#181611]' : 'text-[#5C5547]'}`}>
                        {n.title}
                      </span>
                      {n.detail && <span className="block text-[12px] text-[#726C5D] mt-0.5">{n.detail}</span>}
                      <span className="block text-[11.5px] text-[#8E8675] mt-1">{relativeTime(n.time)}</span>
                    </span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {linkable ? (
                      <Link to={n.linkTo} className="px-4 py-3 flex items-start gap-2.5 hover:bg-[#FAF8F2] transition">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3 flex items-start gap-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

      </div>
    </VolunteerLayout>
  );
};

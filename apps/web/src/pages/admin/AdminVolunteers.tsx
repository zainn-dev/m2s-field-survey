import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CircleCheckBig, Clock3, Download, ExternalLink, Globe, Mail, MapPin, Phone, Target, UserPlus, Users, X } from 'lucide-react';
import { googleMapsUrl } from '@m2s/shared/utils/gpsCapture';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Panel } from '../../components/dashboard/Panel';
import { shortDate } from '../../components/dashboard/format';
import { useAppStore } from '../../store/appStore';
import type { SurveyRecord, UserAccount } from '../../types/survey';
import { downloadCsv } from '../../utils/exportHelpers';
import {
  ActivePill,
  Avatar,
  btnPrimary,
  btnSecondary,
  EmptyRow,
  iconBtn,
  isAdminRole,
  SearchInput,
  selectCls,
  SurveyStatusPill,
  tdCls,
  thCls,
  timeAgo,
  Toggle,
  useActiveToggle,
  UserFormModal,
} from './AdminUsers';

interface VolunteerStat {
  user: UserAccount;
  clusterNames: string[];
  target: number;
  approved: number;
  submitted: number;
  pendingSync: number;
  drafts: number;
  returned: number;
  rejected: number;
  total: number;
  /** approved ÷ reviewed (approved + returned + rejected); null when nothing reviewed yet */
  approvalRate: number | null;
  avgTurnaroundHrs: number | null;
  workloadSharePct: number;
  lastSurveyAt: string;
}

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

const StatTile: React.FC<{ label: string; value: React.ReactNode; icon: React.ElementType; tone: string; chip: string; iconCls: string }> = ({
  label,
  value,
  icon: Icon,
  tone,
  chip,
  iconCls,
}) => (
  <div className={`h-[78px] rounded-[14px] border px-3.5 flex items-center gap-3 ${tone}`}>
    <span className={`w-[46px] h-[46px] rounded-full flex items-center justify-center shrink-0 ${chip}`}>
      <Icon className={`w-[23px] h-[23px] ${iconCls}`} strokeWidth={1.9} />
    </span>
    <span className="min-w-0">
      <span className="block text-[25px] leading-none font-bold tracking-[-0.02em] text-[#181611] tabular-nums">{value}</span>
      <span className="block mt-1.5 text-[13.5px] leading-tight text-[#181611]">{label}</span>
    </span>
  </div>
);

export const AdminVolunteers: React.FC = () => {
  const navigate = useNavigate();
  const { users, clusters, surveys, pendingSurveys, pendingUploads, currentUser, logAudit, notify } = useAppStore();
  const admin = isAdminRole(currentUser.role);
  const toggle = useActiveToggle();

  const [query, setQuery] = useState('');
  const [clusterId, setClusterId] = useState('ALL');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [sort, setSort] = useState<'name' | 'approved' | 'rate' | 'lastActive'>('approved');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const clusterName = useMemo(() => new Map(clusters.map((c) => [c.id, c.name])), [clusters]);

  const stats: VolunteerStat[] = useMemo(() => {
    const byVol = new Map<string, SurveyRecord[]>();
    surveys.forEach((s) => byVol.set(s.volunteerId, [...(byVol.get(s.volunteerId) ?? []), s]));
    return users
      .filter((u) => u.role === 'VOLUNTEER')
      .map((u) => {
        const mine = byVol.get(u.id) ?? [];
        const count = (pred: (s: SurveyRecord) => boolean) => mine.filter(pred).length;
        const approved = count((s) => s.status === 'APPROVED');
        const returned = count((s) => s.status === 'RETURNED');
        const rejected = count((s) => s.status === 'REJECTED');
        const reviewed = approved + returned + rejected;
        const turnaroundHrs = mine
          .filter((s) => s.submittedAt && s.reviews.length > 0)
          .map((s) => {
            const subMs = Date.parse(s.submittedAt!);
            const revMs = Math.max(...s.reviews.map((r) => Date.parse(r.createdAt)).filter(Number.isFinite));
            return Number.isFinite(subMs) && Number.isFinite(revMs) && revMs >= subMs ? (revMs - subMs) / 3_600_000 : null;
          })
          .filter((v): v is number => v !== null);
        return {
          user: u,
          clusterNames: u.assignedClusterIds.map((id) => clusterName.get(id) ?? id),
          target: u.targetHouseholds ?? 0,
          approved,
          submitted: count((s) => s.status === 'SUBMITTED'),
          pendingSync: count((s) => s.status === 'PENDING_SYNC') + pendingSurveys.filter((q) => q.record.volunteerId === u.id).length,
          drafts: count((s) => s.status === 'DRAFT'),
          returned,
          rejected,
          total: mine.length,
          approvalRate: reviewed ? approved / reviewed : null,
          avgTurnaroundHrs: turnaroundHrs.length ? +(turnaroundHrs.reduce((a, b) => a + b, 0) / turnaroundHrs.length).toFixed(1) : null,
          workloadSharePct: surveys.length ? Math.round((mine.length / surveys.length) * 100) : 0,
          lastSurveyAt: mine.reduce((m, s) => (s.updatedAt > m ? s.updatedAt : m), ''),
        };
      });
  }, [users, surveys, pendingSurveys, clusterName]);

  const clusterMonitor = useMemo(
    () =>
      clusters
        .filter((c) => c.active)
        .map((c) => {
          const cs = surveys.filter((s) => s.clusterId === c.id);
          const approved = cs.filter((s) => s.status === 'APPROVED').length;
          const submitted = cs.filter((s) => s.status === 'SUBMITTED').length;
          const returned = cs.filter((s) => s.status === 'RETURNED').length;
          const pendingSync =
            cs.filter((s) => s.status === 'PENDING_SYNC').length + pendingSurveys.filter((q) => q.record.clusterId === c.id).length;
          return {
            id: c.id,
            name: c.name,
            target: c.targetHouseholds,
            total: cs.length,
            approved,
            submitted,
            returned,
            pendingSync,
            pct: c.targetHouseholds > 0 ? Math.min(100, Math.round((approved / c.targetHouseholds) * 100)) : 0,
          };
        }),
    [clusters, surveys, pendingSurveys]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = stats
      .filter((s) => clusterId === 'ALL' || s.user.assignedClusterIds.includes(clusterId))
      .filter((s) => status === 'ALL' || (status === 'ACTIVE' ? s.user.active : !s.user.active))
      .filter((s) => !q || [s.user.name, s.user.mobile, s.user.email].some((v) => (v ?? '').toLowerCase().includes(q)));
    const sorters: Record<typeof sort, (a: VolunteerStat, b: VolunteerStat) => number> = {
      name: (a, b) => a.user.name.localeCompare(b.user.name),
      approved: (a, b) => b.approved - a.approved || b.submitted - a.submitted,
      rate: (a, b) => (b.approvalRate ?? -1) - (a.approvalRate ?? -1),
      lastActive: (a, b) => (b.user.lastActive || '').localeCompare(a.user.lastActive || ''),
    };
    return [...list].sort(sorters[sort]);
  }, [stats, query, clusterId, status, sort]);

  const totals = useMemo(() => {
    const active = stats.filter((s) => s.user.active).length;
    const approved = stats.reduce((n, s) => n + s.approved, 0);
    const submitted = stats.reduce((n, s) => n + s.submitted, 0);
    const pendingSync = pendingSurveys.length + pendingUploads.length + stats.reduce((n, s) => n + s.pendingSync, 0);
    const returned = stats.reduce((n, s) => n + s.returned, 0);
    const turnarounds = stats.map((s) => s.avgTurnaroundHrs).filter((v): v is number => v !== null);
    const avgTurnaround = turnarounds.length ? (turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length).toFixed(1) : null;
    const reviewed = stats.reduce((n, s) => n + s.approved + s.returned + s.rejected, 0);
    return { active, approved, submitted, pendingSync, returned, avgTurnaround, rate: reviewed ? approved / reviewed : null };
  }, [stats, pendingSurveys.length, pendingUploads.length]);

  const open = stats.find((s) => s.user.id === openId) ?? null;

  const exportCsv = () => {
    const header = [
      'Name',
      'Mobile',
      'Email',
      'Active',
      'Clusters',
      'Target',
      'Approved',
      'Submitted',
      'Pending Sync',
      'Drafts',
      'Returned',
      'Rejected',
      'Approval rate',
      'Avg turnaround (hrs)',
      'Workload %',
      'Last active',
      'Last IP',
      'IP Location',
      'Last GPS Lat',
      'Last GPS Lng',
    ];
    const body = rows.map((s) => [
      s.user.name,
      s.user.mobile,
      s.user.email,
      s.user.active ? 'Yes' : 'No',
      s.clusterNames.join('; '),
      s.target || '',
      s.approved,
      s.submitted,
      s.pendingSync,
      s.drafts,
      s.returned,
      s.rejected,
      pct(s.approvalRate),
      s.avgTurnaroundHrs ?? '',
      `${s.workloadSharePct}%`,
      s.user.lastActive,
      s.user.lastIp ?? '',
      s.user.lastIpLocation ?? '',
      s.user.lastGpsLat ?? '',
      s.user.lastGpsLng ?? '',
    ]);
    const file = downloadCsv('volunteers', [header, ...body]);
    const filter = [clusterId !== 'ALL' && `cluster ${clusterName.get(clusterId)}`, status !== 'ALL' && status.toLowerCase(), query && `search "${query}"`]
      .filter(Boolean)
      .join(', ');
    logAudit('export_volunteers', 'volunteer', 'performance', `Exported ${rows.length} volunteer performance rows (CSV)${filter ? ` · ${filter}` : ''}`);
    notify(`Downloaded ${file}`);
  };

  return (
    <AdminLayout title="Volunteers" subtitle="Field team performance, targets, pending sync, turnaround and workload.">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatTile label="Active volunteers" value={`${totals.active}/${stats.length}`} icon={Users} tone="bg-[#F0EEFB] border-[#E4E0F7]" chip="bg-[#E1DCF6]" iconCls="text-[#5A45AE]" />
        <StatTile label="Surveys approved" value={totals.approved} icon={CircleCheckBig} tone="bg-[#FFF8D6] border-[#FFF5C0]" chip="bg-[#FFF5C0]" iconCls="text-[#8C6200]" />
        <StatTile label="Awaiting review" value={totals.submitted} icon={Clock3} tone="bg-[#FFF5E1] border-[#FBEACB]" chip="bg-[#FCE6B6]" iconCls="text-[#C88A0A]" />
        <StatTile label="Pending sync" value={totals.pendingSync} icon={Clock3} tone="bg-[#F5F3FF] border-[#DDD6FE]" chip="bg-[#EDE9FE]" iconCls="text-[#6D28D9]" />
        <StatTile label="Returned" value={totals.returned} icon={Target} tone="bg-[#FEF2F2] border-[#FECACA]" chip="bg-[#FEE2E2]" iconCls="text-[#B91C1C]" />
        <StatTile label="Avg turnaround" value={totals.avgTurnaround ? `${totals.avgTurnaround}h` : '—'} icon={Target} tone="bg-[#EAF1FB] border-[#DCE7F7]" chip="bg-[#D6E4F7]" iconCls="text-[#2D69B3]" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Cluster-wise field progress" titleNote={`(${clusterMonitor.length} active)`}>
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[#EFECE2] text-[#5C5547]">
                  <th className="py-2 font-semibold">Cluster</th>
                  <th className="py-2 text-right font-semibold">Approved</th>
                  <th className="py-2 text-right font-semibold">Review</th>
                  <th className="py-2 text-right font-semibold">Sync</th>
                  <th className="py-2 text-right font-semibold">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE2]">
                {clusterMonitor.map((cm) => (
                  <tr key={cm.id}>
                    <td className="py-2 font-medium text-[#181611]">
                      {cm.name} <span className="text-[11px] text-[#726C5D]">({cm.pct}%)</span>
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-[#8C6200]">
                      {cm.approved}/{cm.target}
                    </td>
                    <td className="py-2 text-right tabular-nums text-[#C88A0A]">{cm.submitted}</td>
                    <td className="py-2 text-right tabular-nums text-[#6D28D9]">{cm.pendingSync}</td>
                    <td className="py-2 text-right tabular-nums text-[#A1460B]">{cm.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Workload distribution" titleNote={`(${surveys.length} total surveys)`}>
          <div className="px-4 pb-4 space-y-2.5">
            {stats.map((s) => (
              <div key={s.user.id} className="space-y-1">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium text-[#181611] truncate">{s.user.name}</span>
                  <span className="text-[#5C5547] tabular-nums">
                    {s.total} surveys ({s.workloadSharePct}%) · Turnaround: {s.avgTurnaroundHrs != null ? `${s.avgTurnaroundHrs}h` : '—'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#EFECE2] overflow-hidden">
                  <div className="h-full rounded-full bg-[#FDC513]" style={{ width: `${s.workloadSharePct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        title="Volunteer performance"
        titleNote={`(${rows.length})`}
        headerExtra={
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={exportCsv} disabled={rows.length === 0} className={`${btnSecondary} h-9`}>
              <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export CSV</span>
            </button>
            {admin && (
              <button type="button" onClick={() => setAdding(true)} className={`${btnPrimary} h-9`}>
                <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">Add volunteer</span>
              </button>
            )}
          </div>
        }
      >
        <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_160px_180px] gap-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search name, mobile or email" className="sm:col-span-2 lg:col-span-1" />
          <select className={selectCls} value={clusterId} onChange={(e) => setClusterId(e.target.value)} aria-label="Filter by cluster">
            <option value="ALL">All clusters</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filter by status">
            <option value="ALL">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <select className={selectCls} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort by">
            <option value="approved">Sort: most approved</option>
            <option value="rate">Sort: approval rate</option>
            <option value="lastActive">Sort: last active</option>
            <option value="name">Sort: name</option>
          </select>
        </div>

        <div className="hidden md:block overflow-x-auto border-t border-[#EFECE2]">
          <table className="w-full text-left min-w-[980px]">
            <thead className="bg-[#FAF8F2]">
              <tr className="border-b border-[#EFECE2]">
                <th className={`${thCls} pl-4`}>Volunteer</th>
                <th className={thCls}>Mobile</th>
                <th className={thCls}>Clusters</th>
                <th className={`${thCls} min-w-[170px]`}>Target progress</th>
                <th className={`${thCls} text-right`}>Approved</th>
                <th className={`${thCls} text-right`}>Submitted</th>
                <th className={`${thCls} text-right`}>Sync</th>
                <th className={`${thCls} text-right`}>Drafts</th>
                <th className={`${thCls} text-right`}>Returned</th>
                <th className={`${thCls} text-right`}>Approval</th>
                <th className={`${thCls} text-right`}>Turnaround</th>
                <th className={`${thCls} text-right`}>Workload</th>
                <th className={thCls}>Location &amp; IP</th>
                <th className={thCls}>Last active</th>
                <th className={`${thCls} pr-4 text-center`}>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <EmptyRow colSpan={15} text={stats.length ? 'No volunteers match these filters.' : 'No volunteers yet.'} />}
              {rows.map((s) => {
                const progress = s.target > 0 ? Math.min(100, Math.round((s.approved / s.target) * 100)) : 0;
                const blocked = toggle.blockedReason(s.user);
                return (
                  <tr
                    key={s.user.id}
                    onClick={() => setOpenId(s.user.id)}
                    className={`border-b last:border-b-0 border-[#EFECE2] cursor-pointer hover:bg-[#FAF8F2] ${s.user.active ? '' : 'opacity-70'}`}
                  >
                    <td className={`${tdCls} pl-4`}>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.user.name} size={32} />
                        <span className="font-semibold whitespace-nowrap">{s.user.name}</span>
                      </div>
                    </td>
                    <td className={`${tdCls} tabular-nums whitespace-nowrap`}>{s.user.mobile || '—'}</td>
                    <td className={`${tdCls} max-w-[200px]`}>
                      {s.clusterNames.length ? (
                        <span className="line-clamp-2 text-[13px]" title={s.clusterNames.join(', ')}>
                          {s.clusterNames.join(', ')}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-[#B26B00]">None assigned</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {s.target > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="flex-1 h-[7px] rounded-full bg-[#E7E2D4] overflow-hidden">
                            <span className="block h-full rounded-full bg-[#FDC513]" style={{ width: `${progress}%` }} />
                          </span>
                          <span className="text-[12.5px] text-[#363127] tabular-nums whitespace-nowrap">
                            {s.approved}/{s.target}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[12.5px] text-[#8E8675]">No target</span>
                      )}
                    </td>
                    <td className={`${tdCls} text-right tabular-nums font-semibold text-[#8C6200]`}>{s.approved}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{s.submitted}</td>
                    <td className={`${tdCls} text-right tabular-nums text-[#6D28D9]`}>{s.pendingSync}</td>
                    <td className={`${tdCls} text-right tabular-nums text-[#5C5547]`}>{s.drafts}</td>
                    <td className={`${tdCls} text-right tabular-nums ${s.returned ? 'text-[#A1460B]' : 'text-[#5C5547]'}`}>{s.returned}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{pct(s.approvalRate)}</td>
                    <td className={`${tdCls} text-right tabular-nums text-[#5C5547]`}>{s.avgTurnaroundHrs != null ? `${s.avgTurnaroundHrs}h` : '—'}</td>
                    <td className={`${tdCls} text-right tabular-nums text-[#5C5547]`}>{s.workloadSharePct}%</td>
                    <td className={`${tdCls} text-[#5C5547] max-w-[200px]`}>
                      {s.user.lastLocationLabel || s.user.lastIp ? (
                        <div className="space-y-0.5 leading-tight">
                          {s.user.lastLocationLabel && (
                            <div className="inline-flex items-center gap-1 text-[12px] font-medium text-[#181611] truncate max-w-[180px]">
                              <MapPin className="w-3 h-3 text-[#217045] shrink-0" />
                              <span className="truncate">{s.user.lastLocationLabel}</span>
                              {s.user.lastGpsLat != null && s.user.lastGpsLng != null && (
                                <a
                                  href={googleMapsUrl(s.user.lastGpsLat, s.user.lastGpsLng)}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Open live GPS in Google Maps"
                                  className="text-[#8C6200] hover:text-[#6E4D00] shrink-0"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          )}
                          {s.user.lastIp && (
                            <div className="text-[11px] font-mono text-[#726C5D] truncate">
                              {s.user.lastIp}
                              {s.user.lastIpLocation ? ` · ${s.user.lastIpLocation}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#8E8675]">—</span>
                      )}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-[#5C5547]`}>{timeAgo(s.user.lastActive)}</td>
                    <td className={`${tdCls} pr-4 text-center`} onClick={(e) => e.stopPropagation()}>
                      {admin ? (
                        <span title={blocked ?? undefined} className="inline-flex">
                          <Toggle
                            checked={s.user.active}
                            disabled={!!blocked}
                            busy={toggle.busyId === s.user.id}
                            label={s.user.active ? `Deactivate ${s.user.name}` : `Reactivate ${s.user.name}`}
                            onChange={(v) => toggle.request(s.user, v)}
                          />
                        </span>
                      ) : (
                        <ActivePill active={s.user.active} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="md:hidden border-t border-[#EFECE2] divide-y divide-[#EFECE2]">
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-[#5C5547]">
              {stats.length ? 'No volunteers match these filters.' : 'No volunteers yet.'}
            </li>
          )}
          {rows.map((s) => {
            const progress = s.target > 0 ? Math.min(100, Math.round((s.approved / s.target) * 100)) : 0;
            const blocked = toggle.blockedReason(s.user);
            return (
              <li
                key={s.user.id}
                onClick={() => setOpenId(s.user.id)}
                className={`p-4 space-y-2.5 cursor-pointer hover:bg-[#FAF8F2] ${s.user.active ? '' : 'opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={s.user.name} size={34} />
                    <div className="min-w-0">
                      <div className="font-semibold text-[14px] text-[#181611] truncate">{s.user.name}</div>
                      <div className="text-[12px] text-[#726C5D] tabular-nums">{s.user.mobile || 'No mobile'}</div>
                    </div>
                  </div>
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    {admin ? (
                      <Toggle
                        checked={s.user.active}
                        disabled={!!blocked}
                        busy={toggle.busyId === s.user.id}
                        label={s.user.active ? `Deactivate ${s.user.name}` : `Reactivate ${s.user.name}`}
                        onChange={(v) => toggle.request(s.user, v)}
                      />
                    ) : (
                      <ActivePill active={s.user.active} />
                    )}
                  </div>
                </div>
                <div className="text-[12px] text-[#5C5547]">
                  Clusters:{' '}
                  {s.clusterNames.length ? (
                    <span className="font-medium text-[#181611]">{s.clusterNames.join(', ')}</span>
                  ) : (
                    <span className="text-[#B26B00]">None assigned</span>
                  )}
                </div>
                {s.target > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 h-[6px] rounded-full bg-[#E7E2D4] overflow-hidden">
                      <span className="block h-full rounded-full bg-[#FDC513]" style={{ width: `${progress}%` }} />
                    </span>
                    <span className="text-[12px] text-[#363127] tabular-nums">{s.approved}/{s.target}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#5C5547] tabular-nums">
                  <span className="font-semibold text-[#8C6200]">{s.approved} approved</span>
                  <span>{s.submitted} submitted</span>
                  <span>{s.drafts} drafts</span>
                  {s.returned > 0 && <span className="text-[#A1460B]">{s.returned} returned</span>}
                  <span>Approval {pct(s.approvalRate)}</span>
                  <span className="ml-auto text-[#726C5D]">{timeAgo(s.user.lastActive)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="px-4 py-2.5 border-t border-[#EFECE2] text-[12px] text-[#726C5D]">
          Approval rate = approved ÷ reviewed (approved + returned + rejected). Click a row to see that volunteer’s surveys.
        </p>
      </Panel>

      <VolunteerDrawer stat={open} surveys={surveys} onClose={() => setOpenId(null)} onOpenSurveys={() => navigate(open ? `/admin/surveys?volunteer=${encodeURIComponent(open.user.id)}` : '/admin/surveys')} />
      {admin && <UserFormModal open={adding} fixedRole="VOLUNTEER" onClose={() => setAdding(false)} />}
      {toggle.dialog}
    </AdminLayout>
  );
};

/* ------------------------------------------------------------------ */
/* Detail drawer                                                       */
/* ------------------------------------------------------------------ */

const VolunteerDrawer: React.FC<{
  stat: VolunteerStat | null;
  surveys: SurveyRecord[];
  onClose: () => void;
  onOpenSurveys: () => void;
}> = ({ stat, surveys, onClose, onOpenSurveys }) => {
  const [tab, setTab] = useState<'ALL' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'DRAFT'>('ALL');

  useEffect(() => {
    if (!stat) return;
    setTab('ALL');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stat?.user.id]);

  if (!stat) return null;
  const u = stat.user;
  const mine = surveys
    .filter((s) => s.volunteerId === u.id)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const shown = mine.filter((s) =>
    tab === 'ALL' ? true : tab === 'DRAFT' ? s.status === 'DRAFT' || s.status === 'PENDING_SYNC' : tab === 'RETURNED' ? s.status === 'RETURNED' || s.status === 'REJECTED' : s.status === tab
  );
  const progress = stat.target > 0 ? Math.min(100, Math.round((stat.approved / stat.target) * 100)) : 0;
  const tabs: { id: typeof tab; label: string; n: number }[] = [
    { id: 'ALL', label: 'All', n: mine.length },
    { id: 'SUBMITTED', label: 'Pending', n: stat.submitted },
    { id: 'APPROVED', label: 'Approved', n: stat.approved },
    { id: 'RETURNED', label: 'Returned', n: stat.returned + stat.rejected },
    { id: 'DRAFT', label: 'Drafts', n: stat.drafts },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${u.name} details`}>
      <div className="absolute inset-0 bg-[#181611]/40" onClick={onClose} />
      <aside className="relative w-full sm:w-[460px] h-full bg-white shadow-2xl flex flex-col z-10">
        <header className="px-5 pt-5 pb-4 border-b border-[#EFECE2]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={u.name} size={46} />
              <div className="min-w-0">
                <h3 className="text-[18px] font-bold tracking-[-0.01em] text-[#181611] truncate">{u.name}</h3>
                <div className="mt-1 flex items-center gap-2">
                  <ActivePill active={u.active} />
                  <span className="text-[12.5px] text-[#726C5D]">Last active {timeAgo(u.lastActive)}</span>
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className={iconBtn}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1 text-[13px] text-[#363127]">
            {u.mobile && (
              <a href={`tel:${u.mobile}`} className="inline-flex items-center gap-2 hover:text-[#6E4D00]">
                <Phone className="w-3.5 h-3.5 text-[#726C5D]" /> {u.mobile}
              </a>
            )}
            <a href={`mailto:${u.email}`} className="inline-flex items-center gap-2 hover:text-[#6E4D00] truncate">
              <Mail className="w-3.5 h-3.5 text-[#726C5D]" /> {u.email}
            </a>
            {(u.lastIp || u.lastLocationLabel || u.lastGpsLat != null) && (
              <div className="pt-1.5 mt-1 border-t border-[#EFECE2] space-y-1 text-[12px] text-[#5C5547]">
                {(u.lastLocationLabel || (u.lastGpsLat != null && u.lastGpsLng != null)) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <MapPin className="w-3.5 h-3.5 text-[#217045] shrink-0" />
                    <span className="font-medium text-[#181611]">{u.lastLocationLabel || 'GPS Captured'}</span>
                    {u.lastGpsLat != null && u.lastGpsLng != null && (
                      <>
                        <span className="font-mono text-[#726C5D]">
                          ({u.lastGpsLat.toFixed(5)}, {u.lastGpsLng.toFixed(5)})
                        </span>
                        <a
                          href={googleMapsUrl(u.lastGpsLat, u.lastGpsLng)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#8C6200] font-semibold hover:underline inline-flex items-center gap-0.5"
                        >
                          Map <ExternalLink className="w-3 h-3" />
                        </a>
                      </>
                    )}
                  </div>
                )}
                {u.lastIp && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[#726C5D] shrink-0" />
                    <span className="font-mono text-[#181611]">{u.lastIp}</span>
                    {u.lastIpLocation && <span>· {u.lastIpLocation}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <section className="px-5 py-4 space-y-3 border-b border-[#EFECE2]">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ['Approved', stat.approved, 'text-[#8C6200]'],
                ['Pending', stat.submitted, 'text-[#8A5A00]'],
                ['Drafts', stat.drafts, 'text-[#4A4336]'],
                ['Returned', stat.returned + stat.rejected, 'text-[#A1460B]'],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-[10px] bg-[#FAF8F2] py-2.5">
                  <div className={`text-[20px] font-bold tabular-nums ${c}`}>{v}</div>
                  <div className="text-[11.5px] text-[#5C5547]">{l}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between text-[13px] mb-1.5">
                <span className="font-semibold text-[#181611]">Target progress</span>
                <span className="text-[#5C5547] tabular-nums">
                  {stat.target > 0 ? `${stat.approved} / ${stat.target} (${progress}%)` : 'No personal target'}
                </span>
              </div>
              <div className="h-[8px] rounded-full bg-[#E7E2D4] overflow-hidden">
                <div className="h-full rounded-full bg-[#FDC513]" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="text-[13px] text-[#363127]">
              <span className="font-semibold text-[#181611]">Clusters: </span>
              {stat.clusterNames.length ? stat.clusterNames.join(', ') : <span className="text-[#B26B00]">None assigned</span>}
            </div>
            <div className="text-[13px] text-[#363127]">
              <span className="font-semibold text-[#181611]">Approval rate: </span>
              {pct(stat.approvalRate)}
            </div>
          </section>

          <section>
            <div className="px-5 flex gap-1 border-b border-[#EFECE2] overflow-x-auto no-scrollbar">
              {tabs.map((t) => {
                const on = t.id === tab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`relative px-2.5 pt-3 pb-2.5 text-[13px] whitespace-nowrap ${on ? 'text-[#8C6200] font-semibold' : 'text-[#363127] hover:text-[#6E4D00]'}`}
                  >
                    {t.label} ({t.n})
                    {on && <span className="absolute left-1.5 right-1.5 -bottom-px h-[3px] rounded-full bg-[#FDC513]" />}
                  </button>
                );
              })}
            </div>
            {shown.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-[#5C5547]">No surveys in this view.</p>
            ) : (
              <ul className="divide-y divide-[#EFECE2]">
                {shown.map((s) => (
                  <li key={s.id} className="px-5 py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-[#181611] truncate">
                        {s.surveyCode || 'Unsynced draft'} · <span className="font-normal">{s.profile.headName || 'Unnamed household'}</span>
                      </div>
                      <div className="text-[12px] text-[#726C5D] truncate">
                        {s.clusterName} · {s.profile.surveyDate ? shortDate(s.profile.surveyDate) : timeAgo(s.updatedAt)}
                      </div>
                    </div>
                    <SurveyStatusPill status={s.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="px-5 py-3.5 border-t border-[#E7E2D4] bg-[#FAF8F2]">
          <button type="button" onClick={onOpenSurveys} className={`${btnSecondary} w-full`}>
            Open survey register <ArrowRight className="w-4 h-4" />
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  );
};

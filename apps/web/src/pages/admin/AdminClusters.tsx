import React, { useEffect, useMemo, useState } from 'react';
import { CircleCheckBig, Clock3, Loader2, MapPin, Pencil, Plus, UsersRound } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { Panel } from '../../components/dashboard/Panel';
import { CoverageMap } from '../../components/dashboard/CoverageMap';
import type { ClusterStat } from '../../components/dashboard/types';
import { DocumentPreview } from '../../components/ui/DocumentPreview';
import { HouseholdDetailDrawer } from './HouseholdDetailDrawer';
import { useAppStore } from '../../store/appStore';
import type { ClusterItem, HouseholdDocument, SurveyRecord } from '../../types/survey';
import {
  Avatar,
  btnPrimary,
  btnSecondary,
  btnSmall,
  Field,
  inputCls,
  isAdminRole,
  Modal,
  ReadOnlyNote,
  SearchInput,
  Toggle,
} from './AdminUsers';

interface ClusterRow extends ClusterStat {
  drafts: number;
  returned: number;
  volunteers: string[];
  supervisors: string[];
}

export const AdminClusters: React.FC = () => {
  const { clusters, surveys, users, currentUser, updateCluster, notify } = useAppStore();
  const admin = isAdminRole(currentUser.role);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<ClusterItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openSurvey, setOpenSurvey] = useState<SurveyRecord | null>(null);
  const [previewDoc, setPreviewDoc] = useState<HouseholdDocument | null>(null);

  const rows: ClusterRow[] = useMemo(
    () =>
      clusters.map((c) => {
        const mine = surveys.filter((s) => s.clusterId === c.id);
        const done = mine.filter((s) => s.status === 'APPROVED').length;
        const submitted = mine.filter((s) => s.status === 'SUBMITTED').length;
        const pct = c.targetHouseholds > 0 ? Math.min(100, Math.round((done / c.targetHouseholds) * 100)) : 0;
        const coverage: ClusterStat['coverage'] = done === 0 && submitted === 0 ? 'empty' : submitted * 2 >= done ? 'pending' : 'completed';
        const assigned = users.filter((u) => u.assignedClusterIds.includes(c.id) && u.active);
        return {
          ...c,
          done,
          submitted,
          pct,
          coverage,
          drafts: mine.filter((s) => s.status === 'DRAFT' || s.status === 'PENDING_SYNC').length,
          returned: mine.filter((s) => s.status === 'RETURNED').length,
          volunteers: assigned.filter((u) => u.role === 'VOLUNTEER').map((u) => u.name),
          supervisors: assigned.filter((u) => u.role === 'SUPERVISOR').map((u) => u.name),
        };
      }),
    [clusters, surveys, users]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => showInactive || r.active)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
  }, [rows, query, showInactive]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.active);
    return {
      target: active.reduce((n, r) => n + r.targetHouseholds, 0),
      done: active.reduce((n, r) => n + r.done, 0),
      submitted: active.reduce((n, r) => n + r.submitted, 0),
      unstaffed: active.filter((r) => r.volunteers.length === 0).length,
      active: active.length,
    };
  }, [rows]);
  const overallPct = totals.target ? Math.min(100, Math.round((totals.done / totals.target) * 100)) : 0;

  const setActive = async (c: ClusterItem, active: boolean) => {
    setBusyId(c.id);
    try {
      await updateCluster(c.id, { active });
      notify(`${c.name} ${active ? 'activated' : 'deactivated'}.`);
    } catch {
      /* toasted */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminLayout title="Clusters" subtitle="Village clusters in the study area, their targets and field coverage.">
      {!admin && <ReadOnlyNote>You can view clusters. Only admins can add clusters or change targets and map positions.</ReadOnlyNote>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch">
        <Panel title="Overall coverage" titleNote={`(${totals.active} active clusters)`} bodyClassName="px-4 pb-4 flex flex-col gap-4">
          <div>
            <div className="flex items-end justify-between">
              <span className="text-[34px] leading-none font-bold tracking-[-0.02em] text-[#181611] tabular-nums">{overallPct}%</span>
              <span className="text-[13.5px] text-[#363127] tabular-nums">
                {totals.done} / {totals.target} households approved
              </span>
            </div>
            <div className="mt-2.5 h-[10px] rounded-full bg-[#EFECE2] overflow-hidden">
              <div className="h-full rounded-full bg-[#FDC513] transition-[width] duration-500" style={{ width: `${overallPct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat icon={CircleCheckBig} label="Approved" value={totals.done} cls="bg-[#FFF8D6] text-[#8C6200]" />
            <MiniStat icon={Clock3} label="Awaiting review" value={totals.submitted} cls="bg-[#EEF4FD] text-[#2B5FA8]" />
            <MiniStat icon={UsersRound} label="No volunteer" value={totals.unstaffed} cls={totals.unstaffed ? 'bg-[#FDE8D8] text-[#A1460B]' : 'bg-[#EFECE2] text-[#5C5547]'} />
          </div>
          {totals.unstaffed > 0 && (
            <p className="text-[12.5px] text-[#A1460B]">
              {totals.unstaffed} active cluster{totals.unstaffed === 1 ? ' has' : 's have'} no active volunteer assigned. Assign one from Users &amp; Roles.
            </p>
          )}
        </Panel>
        <CoverageMap
          clusters={rows.filter((r) => r.active)}
          selectedId={selected}
          onSelect={setSelected}
          surveys={surveys}
          onSelectSurvey={setOpenSurvey}
        />
      </div>

      <Panel
        title="All clusters"
        titleNote={`(${shown.length})`}
        headerExtra={
          admin ? (
            <button type="button" onClick={() => setCreating(true)} className={`${btnPrimary} h-9 shrink-0`}>
              <Plus className="w-4 h-4" /> New cluster
            </button>
          ) : undefined
        }
      >
        <div className="px-4 pb-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <SearchInput value={query} onChange={setQuery} placeholder="Search by name or code" className="flex-1" />
          <label className="inline-flex items-center gap-2 text-[13px] text-[#363127] select-none cursor-pointer">
            <input type="checkbox" className="m2s-check" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 pb-8 pt-4 text-center text-[13px] text-[#5C5547]">No clusters match.</p>
        ) : (
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
            {shown.map((c) => (
              <article
                key={c.id}
                onMouseEnter={() => c.active && setSelected(c.id)}
                className={`rounded-[12px] border p-4 flex flex-col gap-3 transition-colors ${
                  selected === c.id ? 'border-[#D9AE00] bg-[#FFFDF4]' : 'border-[#E7E2D4] bg-white'
                } ${c.active ? '' : 'opacity-70'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-[22px] px-2 rounded-md bg-[#EFECE2] text-[11.5px] font-semibold text-[#4A4336] inline-flex items-center">{c.code}</span>
                      {!c.active && <span className="h-[22px] px-2 rounded-md bg-[#E7E2D4] text-[11.5px] text-[#5C5547] inline-flex items-center">Inactive</span>}
                    </div>
                    <h3 className="mt-1.5 text-[16px] font-bold text-[#181611] truncate">{c.name}</h3>
                    <p className="text-[12px] text-[#726C5D] inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Map position {Math.round(c.mapX)}, {Math.round(c.mapY)}
                    </p>
                  </div>
                  {admin && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Toggle checked={c.active} busy={busyId === c.id} label={c.active ? `Deactivate ${c.name}` : `Activate ${c.name}`} onChange={(v) => setActive(c, v)} />
                      <button type="button" className={btnSmall} onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between text-[13px] mb-1.5">
                    <span className="text-[#363127] tabular-nums">
                      <strong className="text-[#181611]">{c.done}</strong> / {c.targetHouseholds} approved
                    </span>
                    <span className="text-[#5C5547] tabular-nums">{c.pct}%</span>
                  </div>
                  <div className="h-[8px] rounded-full bg-[#EFECE2] overflow-hidden flex">
                    <span className="block h-full bg-[#FDC513]" style={{ width: `${c.pct}%` }} />
                    {c.targetHouseholds > 0 && (
                      <span
                        className="block h-full bg-[#4A7FD4]"
                        style={{ width: `${Math.min(100 - c.pct, Math.round((c.submitted / c.targetHouseholds) * 100))}%` }}
                        title={`${c.submitted} awaiting review`}
                      />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#5C5547]">
                    <Legend color="#D4A100" label={`${c.done} approved`} />
                    <Legend color="#4A7FD4" label={`${c.submitted} submitted`} />
                    <span>{c.drafts} drafts</span>
                    {c.returned > 0 && <span className="text-[#A1460B]">{c.returned} returned</span>}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#EFECE2] grid grid-cols-2 gap-3 text-[12.5px]">
                  <People label="Volunteers" names={c.volunteers} empty="None assigned" warn />
                  <People label="Supervisors" names={c.supervisors} empty="None" />
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      {admin && (
        <ClusterModal
          open={creating || !!editing}
          cluster={editing}
          others={clusters.filter((c) => c.id !== editing?.id)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
      <HouseholdDetailDrawer survey={openSurvey} onClose={() => setOpenSurvey(null)} onPreviewDocument={setPreviewDoc} />
      <DocumentPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </AdminLayout>
  );
};

const MiniStat: React.FC<{ icon: React.ElementType; label: string; value: number; cls: string }> = ({ icon: Icon, label, value, cls }) => (
  <div className="rounded-[12px] border border-[#EFECE2] px-3 py-2.5 flex items-center gap-2.5">
    <span className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${cls}`}>
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
    </span>
    <span className="min-w-0">
      <span className="block text-[19px] leading-none font-bold text-[#181611] tabular-nums">{value}</span>
      <span className="block mt-1 text-[12px] text-[#5C5547] truncate">{label}</span>
    </span>
  </div>
);

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
);

const People: React.FC<{ label: string; names: string[]; empty: string; warn?: boolean }> = ({ label, names, empty, warn }) => (
  <div className="min-w-0">
    <div className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#726C5D] mb-1">
      {label} ({names.length})
    </div>
    {names.length === 0 ? (
      <span className={warn ? 'text-[#B26B00]' : 'text-[#8E8675]'}>{empty}</span>
    ) : (
      <div className="flex items-center gap-1.5 min-w-0" title={names.join(', ')}>
        <span className="flex -space-x-1.5">
          {names.slice(0, 3).map((n) => (
            <span key={n} className="rounded-full ring-2 ring-white">
              <Avatar name={n} size={22} />
            </span>
          ))}
        </span>
        <span className="truncate text-[#363127]">
          {names[0]}
          {names.length > 1 ? ` +${names.length - 1}` : ''}
        </span>
      </div>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Create / edit modal                                                 */
/* ------------------------------------------------------------------ */

type Form = { code: string; name: string; targetHouseholds: string; mapX: string; mapY: string; active: boolean };

const ClusterModal: React.FC<{ open: boolean; cluster: ClusterItem | null; others: ClusterItem[]; onClose: () => void }> = ({
  open,
  cluster,
  others,
  onClose,
}) => {
  const { createCluster, updateCluster, notify } = useAppStore();
  const [f, setF] = useState<Form>({ code: '', name: '', targetHouseholds: '', mapX: '50', mapY: '50', active: true });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBusy(false);
    setF(
      cluster
        ? {
            code: cluster.code,
            name: cluster.name,
            targetHouseholds: String(cluster.targetHouseholds),
            mapX: String(cluster.mapX),
            mapY: String(cluster.mapY),
            active: cluster.active,
          }
        : { code: '', name: '', targetHouseholds: '', mapX: '50', mapY: '50', active: true }
    );
  }, [open, cluster]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const x = Math.max(0, Math.min(100, num(f.mapX) || 0));
  const y = Math.max(0, Math.min(100, num(f.mapY) || 0));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,12}$/.test(code)) errs.code = 'Use 2–12 capital letters, digits or dashes, e.g. CL-08.';
    else if (others.some((o) => o.code.toUpperCase() === code)) errs.code = 'Another cluster already uses this code.';
    if (f.name.trim().length < 2 || f.name.trim().length > 60) errs.name = 'Name must be 2–60 characters.';
    const t = num(f.targetHouseholds);
    if (!Number.isInteger(t) || t < 0 || t > 10000) errs.targetHouseholds = 'Whole number between 0 and 10,000.';
    const mx = num(f.mapX);
    const my = num(f.mapY);
    if (!Number.isFinite(mx) || mx < 0 || mx > 100) errs.mapX = '0–100';
    if (!Number.isFinite(my) || my < 0 || my > 100) errs.mapY = '0–100';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = { code, name: f.name.trim(), targetHouseholds: t, mapX: mx, mapY: my, active: f.active };
    setBusy(true);
    try {
      if (cluster) {
        await updateCluster(cluster.id, body);
        notify(`${body.name} updated.`);
      } else {
        await createCluster(body);
        notify(`${body.name} (${code}) created.`);
      }
      onClose();
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  };

  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    set('mapX', String(Math.round(((e.clientX - r.left) / r.width) * 100)));
    set('mapY', String(Math.round(((e.clientY - r.top) / r.height) * 100)));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={submit}
      title={cluster ? `Edit ${cluster.name}` : 'New cluster'}
      subtitle={cluster ? `Cluster ${cluster.code}` : 'Add a village cluster to the study area.'}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {cluster ? 'Save changes' : 'Create cluster'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Code" htmlFor="cl-code" required error={errors.code} hint="e.g. CL-08">
          <input id="cl-code" className={`${inputCls} uppercase`} value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} disabled={busy} autoFocus />
        </Field>
        <Field label="Name" htmlFor="cl-name" required error={errors.name}>
          <input id="cl-name" className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} disabled={busy} />
        </Field>
        <Field label="Target households" htmlFor="cl-target" required error={errors.targetHouseholds}>
          <input
            id="cl-target"
            type="number"
            min={0}
            max={10000}
            className={inputCls}
            value={f.targetHouseholds}
            onChange={(e) => set('targetHouseholds', e.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label="Status" hint={f.active ? 'Volunteers can survey in this cluster.' : 'Hidden from volunteers and the dashboard.'}>
          <div className="h-10 flex items-center gap-3">
            <Toggle checked={f.active} onChange={(v) => set('active', v)} disabled={busy} label="Active" />
            <span className="text-[13.5px] text-[#181611]">{f.active ? 'Active' : 'Inactive'}</span>
          </div>
        </Field>

        <div className="sm:col-span-2">
          <div className="text-[12.5px] font-semibold text-[#181611] mb-1.5">Position on coverage map</div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3 items-start">
            <div
              role="button"
              tabIndex={0}
              aria-label="Click to place the cluster pin"
              onClick={pick}
              className="relative h-[150px] rounded-[10px] border border-[#DFD9C8] bg-[#E8DFC5] overflow-hidden cursor-crosshair"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(24,22,17,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(24,22,17,0.08) 1px, transparent 1px)',
                backgroundSize: '10% 10%',
              }}
            >
              {others
                .filter((o) => o.active)
                .map((o) => (
                  <span
                    key={o.id}
                    title={o.name}
                    className="absolute w-2 h-2 rounded-full bg-[#726C5D] -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${o.mapX}%`, top: `${o.mapY}%` }}
                  />
                ))}
              <svg
                width="20"
                height="26"
                viewBox="0 0 24 30"
                className="absolute -translate-x-1/2 -translate-y-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] pointer-events-none transition-all"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.4 12 30 12 30s12-9.6 12-18.1C24 5.3 18.6 0 12 0Z" fill="#FDC513" stroke="#181611" strokeWidth="1.4" />
                <circle cx="12" cy="11.6" r="4.4" fill="#181611" />
              </svg>
              <span className="absolute bottom-1.5 right-2 text-[11px] text-[#4A4336] bg-white/80 rounded px-1.5">Click to place</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-3">
              <Field label="X (0 = west, 100 = east)" htmlFor="cl-x" error={errors.mapX}>
                <input id="cl-x" type="number" min={0} max={100} step={0.5} className={inputCls} value={f.mapX} onChange={(e) => set('mapX', e.target.value)} disabled={busy} />
              </Field>
              <Field label="Y (0 = north, 100 = south)" htmlFor="cl-y" error={errors.mapY}>
                <input id="cl-y" type="number" min={0} max={100} step={0.5} className={inputCls} value={f.mapY} onChange={(e) => set('mapY', e.target.value)} disabled={busy} />
              </Field>
            </div>
          </div>
          <p className="mt-1.5 text-[12px] text-[#726C5D]">Grey dots are the other active clusters. Positions are percentages of the dashboard map.</p>
        </div>
      </div>
    </Modal>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircleCheck, Download, Eye, Loader2, X } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { SearchBar } from '../../components/ui/SearchBar';
import { FilterPanel, filterControlClass, filterLabelClass } from '../../components/ui/FilterPanel';
import { ColumnDef, DataTable } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { relativeTime, shortDate } from '../../components/dashboard/format';
import { ExportKind, useAppStore } from '../../store/appStore';
import type { HouseholdDocument, SurveyRecord, SurveyStatus } from '../../types/survey';
import { CompletenessBar, HouseholdDetailDrawer, answerStats, isReviewerRole } from './HouseholdDetailDrawer';

type StatusTab = 'ALL' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'DRAFT';
type SortKey = 'code' | 'head' | 'cluster' | 'volunteer' | 'members' | 'answers' | 'status' | 'date' | 'updated';

const PAGE_SIZE = 25;
const TABS: { id: StatusTab; label: string }[] = [
  { id: 'ALL', label: 'All Surveys' },
  { id: 'SUBMITTED', label: 'Pending Review' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'RETURNED', label: 'Returned' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'DRAFT', label: 'Drafts' },
];
const STATUS_ORDER: Record<SurveyStatus, number> = { SUBMITTED: 0, RETURNED: 1, PENDING_SYNC: 2, DRAFT: 3, APPROVED: 4, REJECTED: 5 };

const isDraft = (s: SurveyRecord) => s.status === 'DRAFT' || s.status === 'PENDING_SYNC';
const inTab = (s: SurveyRecord, t: StatusTab) => (t === 'ALL' ? true : t === 'DRAFT' ? isDraft(s) : s.status === t);
const surveyDay = (s: SurveyRecord) => (s.profile.surveyDate || s.createdAt).slice(0, 10);
const digits = (v: string) => v.replace(/\D/g, '');

const VERIFY_DOT: Record<HouseholdDocument['verificationStatus'], string> = {
  VERIFIED: 'bg-[#FDC513]',
  PENDING: 'bg-[#F2B31B]',
  REJECTED: 'bg-[#D64545]',
};

const DocDots: React.FC<{ docs: HouseholdDocument[] }> = ({ docs }) =>
  docs.length === 0 ? (
    <span className="text-[12px] text-[#8E8675]">None</span>
  ) : (
    <span className="inline-flex items-center gap-1.5" title={docs.map((d) => `${d.docType}: ${d.verificationStatus.toLowerCase()}`).join('\n')}>
      <span className="inline-flex gap-[3px]">
        {docs.slice(0, 5).map((d) => (
          <span key={d.id} className={`w-2 h-2 rounded-full ${VERIFY_DOT[d.verificationStatus]}`} />
        ))}
      </span>
      <span className="text-[12px] tabular-nums text-[#5C5547]">{docs.length}</span>
    </span>
  );

export const AdminSurveys: React.FC = () => {
  const { surveys, clusters, users, documents, currentUser, reviewSurvey, downloadExport, notify } = useAppStore();
  const [params, setParams] = useSearchParams();

  const initialStatus = params.get('status') as StatusTab | null;
  const [tab, setTab] = useState<StatusTab>(TABS.some((t) => t.id === initialStatus) ? initialStatus! : 'ALL');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [clusterId, setClusterId] = useState(params.get('cluster') ?? '');
  const [volunteerId, setVolunteerId] = useState(params.get('volunteer') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [openSurvey, setOpenSurvey] = useState<SurveyRecord | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const reviewer = isReviewerRole(currentUser.role);

  // Deep link: /admin/surveys?focus=<surveyId> opens the drawer.
  const focus = params.get('focus');
  useEffect(() => {
    if (!focus) return;
    const s = surveys.find((x) => x.id === focus || x.householdId === focus || x.surveyCode === focus);
    if (s) {
      setOpenSurvey(s);
      const next = new URLSearchParams(params);
      next.delete('focus');
      setParams(next, { replace: true });
    }
  }, [focus, surveys, params, setParams]);

  /* ---------- lookups ---------- */
  const mobileById = useMemo(() => new Map(users.map((u) => [u.id, u.mobile ?? ''])), [users]);
  const docsByHousehold = useMemo(() => {
    const m = new Map<string, HouseholdDocument[]>();
    documents.forEach((d) => m.set(d.householdId, [...(m.get(d.householdId) ?? []), d]));
    return m;
  }, [documents]);
  const volunteerOptions = useMemo(() => {
    const m = new Map<string, string>();
    surveys.forEach((s) => s.volunteerId && m.set(s.volunteerId, s.volunteerName || 'Unknown'));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [surveys]);
  const statsById = useMemo(() => new Map(surveys.map((s) => [s.id, answerStats(s)])), [surveys]);

  /* ---------- filtering (everything except the status tab) ---------- */
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(q);
    return surveys.filter((s) => {
      if (clusterId && s.clusterId !== clusterId) return false;
      if (volunteerId && s.volunteerId !== volunteerId) return false;
      const day = surveyDay(s);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      if (
        s.surveyCode.toLowerCase().includes(q) ||
        s.profile.headName.toLowerCase().includes(q) ||
        s.volunteerName.toLowerCase().includes(q) ||
        s.clusterName.toLowerCase().includes(q)
      )
        return true;
      return qDigits.length >= 3 && digits(mobileById.get(s.volunteerId) ?? '').includes(qDigits);
    });
  }, [surveys, search, clusterId, volunteerId, from, to, mobileById]);

  const counts = useMemo(() => {
    const c = {} as Record<StatusTab, number>;
    TABS.forEach((t) => (c[t.id] = baseFiltered.filter((s) => inTab(s, t.id)).length));
    return c;
  }, [baseFiltered]);

  const rows = useMemo(() => {
    const list = baseFiltered.filter((s) => inTab(s, tab));
    const val = (s: SurveyRecord): string | number => {
      switch (sortKey) {
        case 'code':
          return s.surveyCode;
        case 'head':
          return s.profile.headName.toLowerCase();
        case 'cluster':
          return s.clusterName;
        case 'volunteer':
          return s.volunteerName.toLowerCase();
        case 'members':
          return s.profile.totalMembers;
        case 'answers':
          return statsById.get(s.id)?.answered ?? 0;
        case 'status':
          return STATUS_ORDER[s.status];
        case 'date':
          return surveyDay(s);
        default:
          return s.updatedAt;
      }
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
      return c !== 0 ? c * dir : b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [baseFiltered, tab, sortKey, sortDir, statsById]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => setPage(1), [tab, search, clusterId, volunteerId, from, to, sortKey, sortDir]);
  // A bulk action must only touch rows the reviewer can currently see.
  useEffect(() => setSelected([]), [tab, search, clusterId, volunteerId, from, to]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Drop selections for surveys that no longer exist.
  useEffect(() => {
    setSelected((sel) => {
      const ids = new Set(surveys.map((s) => s.id));
      const next = sel.filter((id) => ids.has(id));
      return next.length === sel.length ? sel : next;
    });
  }, [surveys]);

  const selectedSubmitted = useMemo(
    () => surveys.filter((s) => selected.includes(s.id) && s.status === 'SUBMITTED'),
    [surveys, selected]
  );

  const activeFilters = [search.trim(), clusterId, volunteerId, from, to].filter(Boolean).length;
  const resetFilters = () => {
    setSearch('');
    setClusterId('');
    setVolunteerId('');
    setFrom('');
    setTo('');
  };

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key as SortKey);
      setSortDir(key === 'updated' || key === 'date' || key === 'answers' || key === 'members' ? 'desc' : 'asc');
    }
  };

  /* ---------- actions ---------- */
  const runExport = async (kind: ExportKind) => {
    setExporting(kind);
    try {
      await downloadExport(kind, {
        status: tab === 'ALL' ? undefined : tab,
        clusterId: clusterId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      const partial = search.trim() || volunteerId;
      notify(
        `${kind === 'surveys.csv' ? 'Survey' : 'Answers'} export downloaded${partial ? ' (status, cluster and date filters applied; search / volunteer filters are not part of exports)' : ''}.`
      );
    } catch {
      /* store toasted */
    } finally {
      setExporting(null);
    }
  };

  const runBulkApprove = async () => {
    const targets = selectedSubmitted;
    let ok = 0;
    const approvedIds: string[] = [];
    setBulkProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      try {
        await reviewSurvey(targets[i].id, 'APPROVE', 'Approved (bulk review).');
        ok++;
        approvedIds.push(targets[i].id);
      } catch {
        /* store toasted this one; continue with the rest */
      }
      setBulkProgress({ done: i + 1, total: targets.length });
    }
    setBulkProgress(null);
    setBulkOpen(false);
    setSelected((sel) => sel.filter((id) => !approvedIds.includes(id)));
    const failed = targets.length - ok;
    notify(
      failed === 0
        ? `Approved ${ok} survey${ok === 1 ? '' : 's'}.`
        : `Approved ${ok} of ${targets.length} surveys; ${failed} could not be approved.`,
      failed === 0 ? 'success' : ok === 0 ? 'error' : 'info'
    );
  };

  /* ---------- table ---------- */
  const columns: ColumnDef<SurveyRecord>[] = [
    {
      key: 'code',
      header: 'Survey ID',
      sortable: true,
      render: (s) => <span className="font-semibold whitespace-nowrap">{s.surveyCode || <span className="text-[#8E8675] font-normal">Unsynced</span>}</span>,
    },
    {
      key: 'head',
      header: 'Head of Household',
      sortable: true,
      render: (s) => (
        <span className="block max-w-[200px] truncate" title={s.profile.headName}>
          {s.profile.headName || '—'}
        </span>
      ),
    },
    { key: 'cluster', header: 'Cluster / Village', sortable: true, render: (s) => <span className="whitespace-nowrap">{s.clusterName}</span> },
    {
      key: 'volunteer',
      header: 'Volunteer',
      sortable: true,
      className: 'hidden lg:table-cell',
      render: (s) => <span className="whitespace-nowrap">{s.volunteerName}</span>,
    },
    {
      key: 'members',
      header: 'Family',
      sortable: true,
      align: 'center',
      className: 'hidden xl:table-cell',
      render: (s) => <span className="tabular-nums">{s.profile.totalMembers}</span>,
    },
    {
      key: 'answers',
      header: 'Answers',
      sortable: true,
      className: 'hidden lg:table-cell',
      render: (s) => {
        const st = statsById.get(s.id);
        return st ? <CompletenessBar answered={st.answered} total={st.total} className="w-[112px]" /> : null;
      },
    },
    {
      key: 'docs',
      header: 'Documents',
      className: 'hidden xl:table-cell',
      render: (s) => <DocDots docs={docsByHousehold.get(s.householdId) ?? []} />,
    },
    { key: 'status', header: 'Status', sortable: true, align: 'center', render: (s) => <StatusBadge status={s.status} className="min-w-[92px]" /> },
    {
      key: 'date',
      header: 'Survey Date',
      sortable: true,
      render: (s) => <span className="whitespace-nowrap">{shortDate(surveyDay(s))}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      sortable: true,
      className: 'hidden 2xl:table-cell',
      render: (s) => <span className="whitespace-nowrap text-[#5C5547]">{relativeTime(s.updatedAt)}</span>,
    },
    {
      key: 'open',
      header: '',
      align: 'center',
      hideOnMobile: true,
      render: (s) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenSurvey(s);
          }}
          aria-label={`View ${s.surveyCode}`}
          className="p-[3px] rounded-md text-[#181611] hover:bg-[#EFECE2]"
        >
          <Eye className="w-[17px] h-[17px]" strokeWidth={1.9} />
        </button>
      ),
    },
  ];

  const exportButtons = (
    <>
      {(['surveys.csv', 'answers.csv'] as ExportKind[]).map((k) => (
        <button
          key={k}
          type="button"
          disabled={!!exporting}
          onClick={() => runExport(k)}
          title={`Export ${k === 'surveys.csv' ? 'one row per household' : 'one row per answer'} (uses the status tab and cluster filter)`}
          className="h-10 px-3.5 rounded-[10px] border border-[#E7E2D4] bg-white text-[13px] font-semibold text-[#181611] inline-flex items-center gap-1.5 hover:border-[#D9AE00] hover:text-[#6E4D00] disabled:opacity-60 transition-colors"
        >
          {exporting === k ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {k === 'surveys.csv' ? 'Surveys CSV' : 'Answers CSV'}
        </button>
      ))}
    </>
  );

  const tableHeader = (
    <>
      <div className="flex items-end gap-4 px-4 border-b border-[#E7E2D4]">
        <h2 className="hidden lg:block pb-2.5 pt-3 text-[18px] font-bold tracking-[-0.01em] text-[#181611] whitespace-nowrap">Survey Register</h2>
        <div role="tablist" className="flex-1 flex items-end gap-1 overflow-x-auto no-scrollbar lg:pl-4">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative px-3 pt-3 pb-2.5 text-[13.5px] whitespace-nowrap transition-colors ${
                  on ? 'text-[#8C6200] font-semibold' : 'text-[#363127] hover:text-[#6E4D00]'
                }`}
              >
                {t.label} <span className={`tabular-nums ${on ? '' : 'text-[#726C5D]'}`}>({counts[t.id]})</span>
                {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-[#FDC513]" />}
              </button>
            );
          })}
        </div>
      </div>
      {selected.length > 0 && (
        <div className="px-4 py-2 bg-[#FFFDF4] border-b border-[#E7E2D4] flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-[#181611]">
          <span>
            <strong className="font-semibold tabular-nums">{selected.length}</strong> selected
            {selectedSubmitted.length > 0 && (
              <span className="text-[#5C5547]"> · {selectedSubmitted.length} pending review</span>
            )}
          </span>
          {reviewer && (
            <button
              type="button"
              disabled={selectedSubmitted.length === 0}
              onClick={() => setBulkOpen(true)}
              className="h-8 px-3 rounded-[9px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <CircleCheck className="w-4 h-4" />
              Approve {selectedSubmitted.length > 0 ? selectedSubmitted.length : ''} submitted
            </button>
          )}
          {rows.length > selected.length && (
            <button
              type="button"
              onClick={() => setSelected(rows.map((r) => r.id))}
              className="text-[12.5px] font-semibold text-[#8C6200] hover:underline"
            >
              Select all {rows.length} in this view
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected([])}
            className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#5C5547] hover:text-[#181611]"
          >
            <X className="w-3.5 h-3.5" /> Clear selection
          </button>
        </div>
      )}
    </>
  );

  return (
    <AdminLayout title="Households / Surveys" subtitle="Every household survey in the study — search, filter, review and export.">
      <FilterPanel activeCount={activeFilters} onReset={resetFilters} actions={exportButtons}>
        <div className="w-full md:w-[280px]">
          <label className={filterLabelClass} htmlFor="survey-search">
            Search
          </label>
          <SearchBar value={search} onChange={setSearch} placeholder="Survey ID, head, volunteer or mobile" ariaLabel="Search surveys" />
        </div>
        <div className="w-full sm:w-auto">
          <label className={filterLabelClass}>Cluster</label>
          <select value={clusterId} onChange={(e) => setClusterId(e.target.value)} className={`${filterControlClass} w-full sm:w-[160px]`}>
            <option value="">All clusters</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className={filterLabelClass}>Volunteer</label>
          <select value={volunteerId} onChange={(e) => setVolunteerId(e.target.value)} className={`${filterControlClass} w-full sm:w-[170px]`}>
            <option value="">All volunteers</option>
            {volunteerOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:flex-none">
            <label className={filterLabelClass}>From</label>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${filterControlClass} w-full sm:w-[148px]`} />
          </div>
          <div className="flex-1 sm:flex-none">
            <label className={filterLabelClass}>To</label>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${filterControlClass} w-full sm:w-[148px]`} />
          </div>
        </div>
      </FilterPanel>

      <DataTable
        data={pageRows}
        columns={columns}
        keyExtractor={(s) => s.id}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        page={page}
        pageSize={PAGE_SIZE}
        totalItems={rows.length}
        onPageChange={setPage}
        onRowClick={setOpenSurvey}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        header={tableHeader}
        itemLabel="surveys"
        emptyTitle={surveys.length === 0 ? 'No surveys yet' : 'No surveys match'}
        emptyDescription={
          surveys.length === 0
            ? 'Surveys appear here as soon as volunteers save them.'
            : 'Try another status tab, or clear the search and filters.'
        }
        renderMobileCard={(s) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[#8C6200]">{s.surveyCode || 'Unsynced'}</div>
                <div className="text-[14px] font-semibold truncate">{s.profile.headName || '—'}</div>
                <div className="text-[12px] text-[#5C5547]">
                  {s.clusterName} · {s.volunteerName} · {shortDate(surveyDay(s))}
                </div>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <CompletenessBar answered={statsById.get(s.id)?.answered ?? 0} total={statsById.get(s.id)?.total ?? 0} className="w-36" />
              <DocDots docs={docsByHousehold.get(s.householdId) ?? []} />
            </div>
          </div>
        )}
      />

      <HouseholdDetailDrawer survey={openSurvey} onClose={() => setOpenSurvey(null)} />

      <ConfirmDialog
        open={bulkOpen}
        title="Approve selected surveys"
        description={
          bulkProgress ? (
            <span className="tabular-nums">
              Approving {Math.min(bulkProgress.done + 1, bulkProgress.total)} of {bulkProgress.total}…
              <span className="block mt-2 h-1.5 rounded-full bg-[#E7E2D4] overflow-hidden">
                <span
                  className="block h-full bg-[#FDC513] transition-all"
                  style={{ width: `${(bulkProgress.done / Math.max(1, bulkProgress.total)) * 100}%` }}
                />
              </span>
            </span>
          ) : (
            <>
              Approve <strong className="text-[#181611]">{selectedSubmitted.length}</strong> survey
              {selectedSubmitted.length === 1 ? '' : 's'} that {selectedSubmitted.length === 1 ? 'is' : 'are'} pending review.
              {selected.length > selectedSubmitted.length && (
                <> {selected.length - selectedSubmitted.length} selected survey(s) in other states will be skipped.</>
              )}
            </>
          )
        }
        confirmLabel={`Approve ${selectedSubmitted.length}`}
        onCancel={() => !bulkProgress && setBulkOpen(false)}
        onConfirm={runBulkApprove}
      />
    </AdminLayout>
  );
};

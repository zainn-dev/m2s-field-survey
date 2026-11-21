import React, { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { AdminLayout } from '../../components/layout/AdminLayout';
import { SearchBar } from '../../components/ui/SearchBar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Pagination } from '../../components/ui/DataTable';
import { useAppStore } from '../../store/appStore';

const PAGE_SIZE = 25;

export const AdminAuditLog: React.FC = () => {
  const { auditLogs } = useAppStore();
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((ev) => {
      if (entityFilter && ev.entity !== entityFilter) return false;
      if (!q) return true;
      return (
        ev.actorName.toLowerCase().includes(q) ||
        ev.action.toLowerCase().includes(q) ||
        ev.summary.toLowerCase().includes(q) ||
        ev.entityId.toLowerCase().includes(q) ||
        (ev.ip ?? '').toLowerCase().includes(q)
      );
    });
  }, [auditLogs, search, entityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  return (
    <AdminLayout
      title="Audit Log"
      subtitle="Immutable trail of logins, survey submissions, review decisions, document checks, and data exports."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search actor, action, IP, or survey ID..."
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by entity"
          className="w-full sm:w-auto min-h-[42px] rounded-xl border border-[#E7E2D4] bg-white px-3 text-xs font-medium"
        >
          <option value="">All Entities</option>
          <option value="survey">Surveys</option>
          <option value="document">Documents</option>
          <option value="user">Users</option>
          <option value="export">Exports</option>
          <option value="cluster">Clusters</option>
        </select>
      </div>

      <div className="bg-white border border-[#E7E2D4] rounded-2xl shadow-card overflow-hidden">
        <div className="divide-y divide-[#E7E2D4]">
          {paged.length === 0 && (
            <div className="px-5 py-10 text-center text-xs text-[#726C5D]">
              No matching audit events found.
            </div>
          )}
          {paged.map((ev) => (
            <div
              key={ev.id}
              className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#FFF8D6] text-[#8C6200] flex items-center justify-center shrink-0 mt-0.5">
                  <History className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[#181611]">{ev.summary}</div>
                  <div className="text-[#726C5D] mt-0.5 break-words">
                    Actor: <strong>{ev.actorName}</strong> • Action:{' '}
                    <code className="bg-[#FAF8F2] px-1.5 py-0.5 rounded">{ev.action}</code>
                    {ev.entityId && (
                      <>
                        {' '}• Ref: <span className="font-mono">{ev.entityId}</span>
                      </>
                    )}
                    {ev.ip && (
                      <>
                        {' '}• IP: <span className="font-mono">{ev.ip}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:text-right shrink-0">
                <StatusBadge status={ev.actorRole} />
                <span className="text-[11px] text-[#726C5D] font-mono">
                  {new Date(ev.createdAt).toLocaleString('en-IN', { hour12: false })}
                </span>
              </div>
            </div>
          ))}
        </div>
        {filtered.length > 0 && (
          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
            itemLabel="events"
          />
        )}
      </div>
    </AdminLayout>
  );
};

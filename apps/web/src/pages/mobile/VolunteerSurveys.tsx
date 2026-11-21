import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CalendarDays, ChevronRight, CloudOff, FolderOpen, MapPin, Plus, Trash2 } from 'lucide-react';
import { VolunteerLayout } from '../../components/layout/VolunteerLayout';
import { SearchBar } from '../../components/ui/SearchBar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { shortDate } from '../../components/dashboard/format';
import { useAppStore } from '../../store/appStore';
import type { SurveyRecord, SurveyStatus } from '../../types/survey';

type FilterKey = 'ALL' | SurveyStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'DRAFT', label: 'Drafts' },
  { key: 'PENDING_SYNC', label: 'Pending sync' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'RETURNED', label: 'Returned' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
];

const isFilterKey = (v: string | null): v is FilterKey => !!v && FILTERS.some((f) => f.key === v);

function latestReturn(s: SurveyRecord) {
  return [...(s.reviews ?? [])]
    .filter((r) => r.decision === 'RETURN')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

export const VolunteerSurveys: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { surveys, documents, currentUser, study, deleteSurvey, isPendingSync, notify, language } = useAppStore();
  const hi = language === 'hi';
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<SurveyRecord | null>(null);

  const statusParam = params.get('status');
  const filter: FilterKey = isFilterKey(statusParam) ? statusParam : 'ALL';
  const setFilter = (key: FilterKey) => {
    const next = new URLSearchParams(params);
    if (key === 'ALL') next.delete('status');
    else next.set('status', key);
    setParams(next, { replace: true });
  };

  const mine = useMemo(
    () =>
      surveys
        .filter((s) => s.volunteerId === currentUser.id)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [surveys, currentUser.id]
  );

  const docCount = useMemo(() => {
    const m = new Map<string, number>();
    documents.forEach((d) => m.set(d.householdId, (m.get(d.householdId) ?? 0) + 1));
    return m;
  }, [documents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine.filter((s) => {
      if (filter !== 'ALL' && s.status !== filter) return false;
      if (!q) return true;
      return (
        s.surveyCode.toLowerCase().includes(q) ||
        (s.profile.headName ?? '').toLowerCase().includes(q) ||
        (s.clusterName ?? '').toLowerCase().includes(q)
      );
    });
  }, [mine, filter, search]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    await deleteSurvey(toDelete.id);
    notify('Draft deleted');
    setToDelete(null);
  };

  return (
    <VolunteerLayout
      title={hi ? 'मेरे सर्वे' : 'My surveys'}
      actions={
        <button
          type="button"
          onClick={() => navigate('/volunteer/surveys/new')}
          className="h-9 px-3 rounded-[10px] bg-white text-[#5C4100] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#FFF8D6] transition"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
      }
    >
      <div className="bg-white border-b border-[#E7E2D4] px-4 pt-3 pb-2.5 space-y-2.5">
        <SearchBar value={search} onChange={setSearch} placeholder="Search ID, name or cluster" />
        <div className="flex flex-wrap gap-1.5 pb-0.5">
          {FILTERS.map((f) => {
            const count = f.key === 'ALL' ? mine.length : mine.filter((s) => s.status === f.key).length;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={`h-8 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap border transition ${
                  active
                    ? 'bg-[#FDC513] text-[#181611] border-[#D9AE00]'
                    : 'bg-white text-[#5C5547] border-[#E7E2D4] hover:border-[#D9AE00]/40 hover:text-[#181611]'
                }`}
              >
                {f.label}
                <span className={`ml-1.5 ${active ? 'text-[#181611]/75' : 'text-[#8E8675]'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 flex-1">
        {filtered.length === 0 ? (
          <EmptyState
            title={mine.length === 0 ? 'No surveys yet' : 'No surveys match'}
            description={
              mine.length === 0
                ? 'Start your first household survey. It is saved on this device until it syncs.'
                : 'Try another filter or clear the search.'
            }
            action={
              <button
                type="button"
                onClick={() => navigate('/volunteer/surveys/new')}
                className="h-10 px-4 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[13.5px] font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Start new survey
              </button>
            }
          />
        ) : (
          filtered.map((s) => {
            const editable = s.status === 'DRAFT' || s.status === 'RETURNED';
            const canDelete = s.status === 'DRAFT' && study.allowVolunteerDelete;
            const ret = s.status === 'RETURNED' ? latestReturn(s) : undefined;
            const docs = docCount.get(s.householdId || s.id) ?? 0;
            const onDevice = s.status === 'DRAFT' && isPendingSync(s.id);
            return (
              <article
                key={s.id}
                className="bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/volunteer/surveys/${s.id}`)}
                  className="w-full text-left p-4 hover:bg-[#FAF8F2] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className={`text-[12px] font-semibold tracking-wide ${
                          s.surveyCode ? 'text-[#8C6200] font-mono' : 'text-[#9A6800]'
                        }`}
                      >
                        {s.surveyCode || 'Not yet synced'}
                      </div>
                      <div className="text-[15px] font-semibold text-[#181611] mt-0.5 truncate">
                        {s.profile.headName || 'Unnamed household'}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#726C5D]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {s.clusterName || s.profile.clusterName || 'No cluster'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {shortDate(s.profile.surveyDate || s.createdAt)}
                    </span>
                    {onDevice && (
                      <span className="inline-flex items-center gap-1 text-[#9A6800]">
                        <CloudOff className="w-3.5 h-3.5" />
                        Saved on device
                      </span>
                    )}
                  </div>
                  {ret && (
                    <div className="mt-3 rounded-[10px] bg-[#FDECEA] border border-[#F2C9C5] px-3 py-2 text-[12.5px] text-[#8E2A24] flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C93B32]" />
                      <span>
                        <strong className="font-semibold">Returned:</strong> {ret.reason}
                      </span>
                    </div>
                  )}
                </button>
                <div className="flex items-center border-t border-[#EFECE2] text-[13px] font-semibold">
                  <button
                    type="button"
                    onClick={() => navigate(`/volunteer/surveys/${s.id}`)}
                    className="flex-1 h-11 inline-flex items-center justify-center gap-1 text-[#8C6200] hover:bg-[#FAF8F2]"
                  >
                    {editable ? (s.status === 'RETURNED' ? 'Fix and resubmit' : 'Continue') : 'View'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="w-px h-6 bg-[#E7E2D4]" />
                  <button
                    type="button"
                    onClick={() => navigate(`/volunteer/documents/${s.householdId || s.id}`)}
                    className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-[#181611] hover:bg-[#FAF8F2]"
                  >
                    <FolderOpen className="w-4 h-4 text-[#8C6200]" />
                    Documents{docs > 0 ? ` (${docs})` : ''}
                  </button>
                  {canDelete && (
                    <>
                      <span className="w-px h-6 bg-[#E7E2D4]" />
                      <button
                        type="button"
                        onClick={() => setToDelete(s)}
                        aria-label="Delete draft"
                        className="w-12 h-11 inline-flex items-center justify-center text-[#C93B32] hover:bg-[#FDECEA]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        variant="danger"
        title="Delete this draft?"
        description={
          <>
            The draft for <strong>{toDelete?.profile.headName || 'this household'}</strong> and any documents captured
            for it will be permanently deleted. This cannot be undone.
          </>
        }
        confirmLabel="Delete draft"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </VolunteerLayout>
  );
};

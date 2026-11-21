import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@m2s/shared/components/ConfirmDialog';
import { EmptyState } from '@m2s/shared/components/EmptyState';
import { SearchBar } from '@m2s/shared/components/SearchBar';
import { StatusBadge } from '@m2s/shared/components/StatusBadge';
import { evaluateSurveyQuality } from '@m2s/shared/utils/surveyQuality';
import type { SurveyRecord } from '@m2s/shared/types/survey';
import { useMobileStore } from '../store/mobileStore';
import { MobileLayout } from '../components/MobileLayout';

type FilterTab = 'ALL' | 'DRAFT' | 'PENDING_SYNC' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';

export const VolunteerSurveys: React.FC = () => {
  const navigate = useNavigate();
  const { surveys, documents, isPendingSync, deleteSurvey, language } = useMobileStore();
  const hi = language === 'hi';

  const [tab, setTab] = useState<FilterTab>('ALL');
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<SurveyRecord | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return surveys
      .filter((s) => {
        const pending = isPendingSync(s.id);
        if (tab === 'PENDING_SYNC') return pending;
        if (tab === 'RETURNED') return s.status === 'RETURNED' || s.status === 'REJECTED';
        if (tab !== 'ALL' && s.status !== tab) return false;
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        return (
          s.profile.headName.toLowerCase().includes(q) ||
          s.surveyCode.toLowerCase().includes(q) ||
          s.clusterName.toLowerCase().includes(q) ||
          s.profile.idLast4.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [surveys, tab, query, isPendingSync]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'ALL', label: hi ? 'सभी' : 'All' },
    { key: 'DRAFT', label: hi ? 'ड्राफ़्ट' : 'Drafts' },
    { key: 'PENDING_SYNC', label: hi ? 'पेंडिंग सिंक' : 'Pending Sync' },
    { key: 'SUBMITTED', label: hi ? 'जमा' : 'Submitted' },
    { key: 'APPROVED', label: hi ? 'स्वीकृत' : 'Approved' },
    { key: 'RETURNED', label: hi ? 'सुधार' : 'Returned' },
  ];

  return (
    <MobileLayout title={hi ? 'मेरे सर्वेक्षण' : 'My Surveys'}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder={hi ? 'नाम, कोड या क्लस्टर खोजें…' : 'Search head name, code, cluster…'}
          />
        </div>
        <Link
          to="/surveys/new"
          className="h-11 px-3.5 rounded-[12px] bg-[#FDC513] text-[#181611] text-[13px] font-bold inline-flex items-center gap-1.5 shrink-0 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full text-[12px] font-semibold whitespace-nowrap border transition ${
              tab === t.key
                ? 'bg-[#181611] text-[#FDC513] border-[#181611]'
                : 'bg-white text-[#5C5547] border-[#DFD9C8]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="w-5 h-5" />}
          title="No surveys match this filter"
          description="Tap 'New' to start a household survey draft."
          action={
            <button
              type="button"
              onClick={() => navigate('/surveys/new')}
              className="h-10 px-4 rounded-[10px] bg-[#FDC513] text-[#181611] text-[13px] font-bold"
            >
              Start New Survey
            </button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((s) => {
            const pending = isPendingSync(s.id);
            const quality = evaluateSurveyQuality({
              survey: s,
              documents: documents.filter((d) => d.householdId === s.householdId),
              peerSurveys: surveys,
            });
            const canDelete = s.status === 'DRAFT' && !pending;
            return (
              <div
                key={s.id}
                className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 shadow-[0_1px_2px_rgba(24,22,17,0.04)] space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/surveys/${s.id}`} className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold text-[#181611] truncate">
                      {s.profile.headName || 'Unnamed Household'}
                    </h3>
                    <p className="text-[12px] text-[#5C5547] truncate mt-0.5">
                      {s.surveyCode || 'Draft'} · {s.clusterName || 'No Cluster'} · {quality.completenessScore}% complete
                    </p>
                  </Link>
                  <StatusBadge status={pending ? 'PENDING_SYNC' : s.status} />
                </div>

                {s.status === 'RETURNED' && s.reviews.length > 0 && (
                  <p className="text-[12px] text-[#A1460B] bg-[#FDE8D8] rounded-lg px-2.5 py-1.5">
                    Correction note: {s.reviews[s.reviews.length - 1].reason || 'Please review highlighted sections.'}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1.5 border-t border-[#EFECE2] text-[12px]">
                  <span className="text-[#5C5547]">
                    Updated {new Date(s.updatedAt).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link to={`/documents/${s.householdId}`} className="font-semibold text-[#8C6200]">
                      Docs
                    </Link>
                    <Link
                      to={`/surveys/${s.id}`}
                      className="px-3 py-1 rounded-lg bg-[#FFF8D6] text-[#5C4100] font-semibold"
                    >
                      {s.status === 'DRAFT' || s.status === 'RETURNED' || pending ? 'Continue' : 'View'}
                    </Link>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(s)}
                        aria-label={`Delete ${s.profile.headName || 'draft'}`}
                        className="p-1.5 rounded-lg text-[#B42318] hover:bg-[#FDECEA]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete survey draft?"
        description={`Remove "${confirmDelete?.profile.headName || 'this draft'}" permanently?`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) deleteSurvey(confirmDelete.id).catch(() => undefined);
          setConfirmDelete(null);
        }}
      />
    </MobileLayout>
  );
};

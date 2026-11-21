import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleCheckBig, Eye, EllipsisVertical, RotateCcw } from 'lucide-react';
import type { HouseholdDocument, SurveyRecord, SurveyStatus } from '../../types/survey';
import { incomeBefore, incomeNow, shortDate } from './format';

export type SurveyTab = 'ALL' | 'SUBMITTED' | 'APPROVED' | 'DRAFT';

const STATUS_PILL: Partial<Record<SurveyStatus, { label: string; cls: string }>> = {
  SUBMITTED: { label: 'Pending Review', cls: 'bg-[#E6EEF9] text-[#2D5E9E]' },
  APPROVED: { label: 'Completed', cls: 'bg-[#FFF3B0] text-[#5C4100] border border-[#E8C533]/50' },
  DRAFT: { label: 'Draft', cls: 'bg-[#F0EDE2] text-[#4A4538]' },
  PENDING_SYNC: { label: 'Pending Sync', cls: 'bg-[#EEEBFB] text-[#5A45AE]' },
  RETURNED: { label: 'Returned', cls: 'bg-[#FDE8D8] text-[#A1460B]' },
  REJECTED: { label: 'Rejected', cls: 'bg-[#FDE2E1] text-[#B42318]' },
};

const StatusPill: React.FC<{ status: SurveyStatus }> = ({ status }) => {
  const s = STATUS_PILL[status] ?? { label: status, cls: 'bg-[#E7E2D4] text-[#4A4336]' };
  return (
    <span className={`inline-flex items-center justify-center min-w-[92px] h-[22px] px-2.5 rounded-md text-[11.5px] font-medium whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
};

const DocThumbs: React.FC<{ docs: HouseholdDocument[] }> = ({ docs }) => {
  const shown = docs.slice(0, 3);
  const extra = docs.length - shown.length;
  if (docs.length === 0) return <span className="text-[12px] text-[#8E8675]">None</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex">
        {shown.map((d, i) => (
          <img
            key={d.id}
            src={d.pages[0]?.localPreviewUrl}
            alt={d.docType}
            title={d.docType}
            className={`w-[22px] h-[22px] rounded-[4px] border border-[#DFD9C8] object-cover bg-[#EFECE2] ${i ? '-ml-[3px]' : ''}`}
          />
        ))}
      </span>
      <span className={`h-[22px] min-w-[26px] px-1.5 rounded-md bg-[#EFECE2] text-[11px] font-medium text-[#4A4336] leading-[22px] text-center ${extra > 0 ? '' : 'invisible'}`}>
        +{Math.max(extra, 0)}
      </span>
    </span>
  );
};

interface RecentSurveysProps {
  surveys: SurveyRecord[];
  documents: HouseholdDocument[];
  counts: { submitted: number; approved: number; drafts: number };
  tab: SurveyTab;
  onTab: (t: SurveyTab) => void;
  onOpen: (s: SurveyRecord) => void;
  onReview: (id: string, decision: 'APPROVE' | 'RETURN') => void;
  /** Which review decisions the signed-in reviewer may take on a survey (server rules: only admins re-review). */
  canDecide: (s: SurveyRecord, decision: 'APPROVE' | 'RETURN') => boolean;
  onViewAll: () => void;
  filterNote?: React.ReactNode;
}

export const RecentSurveys: React.FC<RecentSurveysProps> = ({
  surveys,
  documents,
  counts,
  tab,
  onTab,
  onOpen,
  onReview,
  canDecide,
  onViewAll,
  filterNote,
}) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuFor]);

  const tabs: { id: SurveyTab; label: string }[] = [
    { id: 'ALL', label: 'All Surveys' },
    { id: 'SUBMITTED', label: `Pending Review (${counts.submitted})` },
    { id: 'APPROVED', label: `Completed (${counts.approved})` },
    { id: 'DRAFT', label: `Drafts (${counts.drafts})` },
  ];

  const allChecked = surveys.length > 0 && surveys.every((s) => selected.includes(s.id));
  const docsFor = (s: SurveyRecord) => documents.filter((d) => d.householdId === s.householdId);

  return (
    <section className="bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)] min-w-0">
      {/* Header + tabs */}
      <div className="flex items-end gap-4 px-4 border-b border-[#E7E2D4]">
        <h2 className="pb-2.5 pt-3 text-[18px] font-bold tracking-[-0.01em] text-[#181611] whitespace-nowrap">
          Recent Surveys
        </h2>
        <div role="tablist" className="flex-1 flex items-end gap-1 overflow-x-auto no-scrollbar 2xl:pl-8">
          {tabs.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => onTab(t.id)}
                className={`relative px-3 2xl:px-4 pt-3 pb-2.5 text-[13.5px] whitespace-nowrap transition-colors ${
                  on ? 'text-[#8C6200] font-semibold' : 'text-[#363127] hover:text-[#8C6200]'
                }`}
              >
                {t.label}
                {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-full bg-[#FDC513]" />}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="hidden sm:inline-flex pb-3 items-center gap-1 text-[13px] font-semibold text-[#8C6200] hover:text-[#6E4D00] whitespace-nowrap"
        >
          View All <ArrowRight className="w-[15px] h-[15px]" strokeWidth={2.2} />
        </button>
      </div>

      {filterNote}

      {surveys.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-[#5C5547]">No surveys in this view.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11.5px] font-semibold text-[#181611] border-b border-[#EFECE2]">
                  <th className="pl-4 pr-1 py-2 whitespace-nowrap w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? [] : surveys.map((s) => s.id))}
                      className="m2s-check"
                    />
                  </th>
                  <th className="px-2.5 py-2 whitespace-nowrap">Survey ID</th>
                  <th className="px-2.5 py-2 whitespace-nowrap">Head of Household</th>
                  <th className="px-2.5 py-2 whitespace-nowrap">Cluster / Village</th>
                  <th className="hidden lg:table-cell px-2.5 py-2 whitespace-nowrap">Family Size</th>
                  <th className="px-2.5 py-2 whitespace-nowrap">Income (Before → Now)</th>
                  <th className="hidden lg:table-cell px-2.5 py-2 whitespace-nowrap">Documents</th>
                  <th className="px-2.5 py-2 whitespace-nowrap text-center">Status</th>
                  <th className="px-2.5 py-2 whitespace-nowrap">Date</th>
                  <th className="pl-2 pr-3 py-2 whitespace-nowrap text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[12.5px] text-[#181611]">
                {surveys.map((s) => {
                  const checked = selected.includes(s.id);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => onOpen(s)}
                      className={`border-b last:border-b-0 border-[#EFECE2] cursor-pointer transition-colors ${
                        checked ? 'bg-[#FFF8D6]' : 'hover:bg-[#FAF8F2]'
                      }`}
                    >
                      <td className="pl-4 pr-1 py-[5px]" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.surveyCode}`}
                          checked={checked}
                          onChange={() =>
                            setSelected((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))
                          }
                          className="m2s-check"
                        />
                      </td>
                      <td className="px-2.5 py-[5px] font-semibold whitespace-nowrap">{s.surveyCode}</td>
                      <td className="px-2.5 py-[5px] whitespace-nowrap">{s.profile.headName}</td>
                      <td className="px-2.5 py-[5px] whitespace-nowrap">{s.clusterName}</td>
                      <td className="hidden lg:table-cell px-2.5 py-[5px] pl-7 tabular-nums">{s.profile.totalMembers}</td>
                      <td className="px-2.5 py-[5px] whitespace-nowrap tabular-nums">
                        {incomeBefore(s.profile.incomeBeforeApprox, s.profile.incomeBeforeCode)} →{' '}
                        {incomeNow(s.profile.incomeNowCode, s.profile.incomeBeforeApprox)}
                      </td>
                      <td className="hidden lg:table-cell px-2.5 py-[5px]">
                        <DocThumbs docs={docsFor(s)} />
                      </td>
                      <td className="px-2.5 py-[5px] text-center">
                        <StatusPill status={s.status} />
                      </td>
                      <td className="px-2.5 py-[5px] whitespace-nowrap">{shortDate(s.profile.surveyDate)}</td>
                      <td className="pl-2 pr-3 py-[5px]" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpen(s)}
                            aria-label={`View ${s.surveyCode}`}
                            className="p-[3px] rounded-md text-[#181611] hover:bg-[#EFECE2]"
                          >
                            <Eye className="w-[17px] h-[17px]" strokeWidth={1.9} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMenuFor((m) => (m === s.id ? null : s.id))}
                            aria-label={`More actions for ${s.surveyCode}`}
                            aria-expanded={menuFor === s.id}
                            className="p-[3px] rounded-md text-[#181611] hover:bg-[#EFECE2]"
                          >
                            <EllipsisVertical className="w-[17px] h-[17px]" strokeWidth={1.9} />
                          </button>
                          {menuFor === s.id && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-[#E7E2D4] shadow-[0_12px_32px_-10px_rgba(24,22,17,0.3)] z-30 p-1 text-[13px]"
                            >
                              <RowAction icon={Eye} label="Open household" onClick={() => { setMenuFor(null); onOpen(s); }} />
                              {canDecide(s, 'APPROVE') && (
                                <RowAction icon={CircleCheckBig} label="Approve" tone="green" onClick={() => { setMenuFor(null); onReview(s.id, 'APPROVE'); }} />
                              )}
                              {canDecide(s, 'RETURN') && (
                                <RowAction icon={RotateCcw} label="Return for edits" tone="amber" onClick={() => { setMenuFor(null); onReview(s.id, 'RETURN'); }} />
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-[#EFECE2]">
            {surveys.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onOpen(s)} className="w-full text-left px-4 py-3 active:bg-[#FAF8F2]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[#8C6200]">{s.surveyCode}</div>
                      <div className="text-[14px] font-semibold truncate">{s.profile.headName}</div>
                      <div className="text-[12px] text-[#5C5547]">
                        {s.clusterName} · {shortDate(s.profile.surveyDate)}
                      </div>
                    </div>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[12px] text-[#363127]">
                    <span>Family {s.profile.totalMembers}</span>
                    <span className="tabular-nums">
                      {incomeBefore(s.profile.incomeBeforeApprox, s.profile.incomeBeforeCode)} →{' '}
                      {incomeNow(s.profile.incomeNowCode, s.profile.incomeBeforeApprox)}
                    </span>
                    <DocThumbs docs={docsFor(s)} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

const RowAction: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: 'green' | 'amber';
}> = ({ icon: Icon, label, onClick, tone }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left font-medium ${
      tone === 'green'
        ? 'text-[#8C6200] hover:bg-[#FFF8D6]'
        : tone === 'amber'
          ? 'text-[#9A5B00] hover:bg-[#FFF5E1]'
          : 'text-[#181611] hover:bg-[#FAF8F2]'
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
  </button>
);

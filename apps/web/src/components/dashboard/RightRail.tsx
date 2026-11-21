import React from 'react';
import { ChartColumn, Download, Plus, UserPlus } from 'lucide-react';
import type { AuditEvent, HouseholdDocument } from '../../types/survey';
import { Panel } from './Panel';
import { relativeTime } from './format';

/* ---------------- Recent Documents ---------------- */

const VERIFY_COLOR: Record<HouseholdDocument['verificationStatus'], string> = {
  VERIFIED: 'bg-[#FDC513]',
  PENDING: 'bg-[#2563EB]',
  REJECTED: 'bg-[#D64545]',
};

interface RecentDocumentsProps {
  documents: HouseholdDocument[];
  onPreview: (doc: HouseholdDocument) => void;
  onDownload: (doc: HouseholdDocument) => void;
  onViewAll: () => void;
}

export const RecentDocuments: React.FC<RecentDocumentsProps> = ({ documents, onPreview, onDownload, onViewAll }) => (
  <Panel title="Recent Documents" onViewAll={onViewAll} bodyClassName="px-4 pb-3">
    {documents.length === 0 ? (
      <p className="py-6 text-center text-[13px] text-[#625C4E]">No documents uploaded yet.</p>
    ) : (
      <ul className="divide-y divide-[#F2EEE2]">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center gap-3 py-[7px]">
            <button type="button" onClick={() => onPreview(doc)} className="flex flex-1 min-w-0 items-center gap-3 text-left group">
              <img
                src={doc.pages[0]?.localPreviewUrl}
                alt=""
                className="w-[62px] h-[44px] rounded-[5px] border border-[#DFD9C8] object-cover bg-[#F3EFE3] shrink-0 group-hover:ring-2 group-hover:ring-[#FDC513]/60 transition"
              />
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-[#181611] truncate group-hover:text-[#8C6200]">
                  {doc.docType}
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-[12px] text-[#363127] min-w-0">
                  <span
                    className={`w-[15px] h-[15px] rounded-full ${VERIFY_COLOR[doc.verificationStatus]} flex items-center justify-center shrink-0`}
                    title={doc.verificationStatus.toLowerCase()}
                  >
                    <svg viewBox="0 0 12 12" className="w-[9px] h-[9px]" aria-hidden="true">
                      <path
                        d="M2.5 6.2 5 8.5l4.5-5"
                        fill="none"
                        stroke={doc.verificationStatus === 'VERIFIED' ? '#181611' : '#fff'}
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="truncate">
                    {doc.surveyCode} • {doc.headName}
                  </span>
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDownload(doc)}
              aria-label={`Download ${doc.docType}`}
              className="w-[38px] h-[34px] rounded-lg border border-[#E2DCCB] flex items-center justify-center text-[#181611] hover:border-[#D9AE00] hover:text-[#8C6200] shrink-0 transition-colors"
            >
              <Download className="w-[18px] h-[18px]" strokeWidth={1.9} />
            </button>
          </li>
        ))}
      </ul>
    )}
  </Panel>
);

/* ---------------- Quick Actions ---------------- */

interface QuickActionsProps {
  onNavigate: (path: string) => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onNavigate }) => {
  const actions = [
    { label: 'New Survey', icon: Plus, to: '/volunteer/surveys/new', cls: 'bg-[#FDC513] hover:bg-[#E5B00D]', icon_cls: 'text-[#181611]' },
    { label: 'Add Volunteer', icon: UserPlus, to: '/admin/volunteers', cls: 'bg-[#EEEBFB] hover:bg-[#E2DDF8]', icon_cls: 'text-[#5A45AE]' },
    { label: 'Export Data', icon: Download, to: '/admin/exports', cls: 'bg-[#E7F0FB] hover:bg-[#D8E6F8]', icon_cls: 'text-[#2D69B3]' },
    { label: 'View Reports', icon: ChartColumn, to: '/admin/analytics', cls: 'bg-[#FFF5D6] hover:bg-[#FFECAD]', icon_cls: 'text-[#8C6200]' },
  ];
  return (
    <Panel title="Quick Actions" bodyClassName="px-4 pb-4">
      <div className="grid grid-cols-2 gap-2.5 2xl:gap-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => onNavigate(a.to)}
              className={`h-[44px] rounded-[9px] px-2 flex items-center justify-center gap-2 2xl:gap-2.5 text-[13px] 2xl:text-[13.5px] whitespace-nowrap font-semibold text-[#181611] transition-colors ${a.cls}`}
            >
              <Icon className={`w-[21px] h-[21px] ${a.icon_cls}`} strokeWidth={2} />
              {a.label}
            </button>
          );
        })}
      </div>
    </Panel>
  );
};

/* ---------------- Recent Activity ---------------- */

const AMBER_ACTIONS = /pending|return|reject|fail/i;

export const RecentActivity: React.FC<{ events: AuditEvent[]; onViewAll: () => void }> = ({ events, onViewAll }) => (
  <Panel title="Recent Activity" onViewAll={onViewAll} bodyClassName="px-4 pb-4">
    {events.length === 0 ? (
      <p className="py-6 text-center text-[13px] text-[#625C4E]">No activity yet.</p>
    ) : (
      <ol className="relative mt-1">
        <span aria-hidden="true" className="absolute left-[5px] top-3 bottom-6 w-px bg-[#DFD9C8]" />
        {events.map((ev) => (
          <li key={ev.id} className="relative flex gap-4 pb-3.5 last:pb-0">
            <span
              className={`relative z-10 mt-[5px] w-[11px] h-[11px] rounded-full ring-[3px] ring-white shrink-0 ${
                AMBER_ACTIONS.test(ev.action) ? 'bg-[#D97706]' : 'bg-[#FDC513]'
              }`}
            />
            <span className="min-w-0">
              <span className="block text-[14px] text-[#181611] leading-snug">{ev.summary}</span>
              <span className="block mt-0.5 text-[12px] text-[#5C5547]">{relativeTime(ev.createdAt)}</span>
            </span>
          </li>
        ))}
      </ol>
    )}
  </Panel>
);

import React from 'react';
import { CircleCheckBig, Clock3, FileText, Users, UsersRound, type LucideIcon } from 'lucide-react';

type Tone = 'gold' | 'goldDeep' | 'amber' | 'blue' | 'violet';

const TONES: Record<Tone, { card: string; chip: string; icon: string }> = {
  gold: { card: 'bg-[#FFF8D6] border-[#F3E29B]', chip: 'bg-[#FDC513]', icon: 'text-[#181611]' },
  goldDeep: { card: 'bg-[#FFF5C2] border-[#EED77C]', chip: 'bg-[#FFE14D]', icon: 'text-[#181611]' },
  amber: { card: 'bg-[#FFF4DF] border-[#F6DBB1]', chip: 'bg-[#FCE2B4]', icon: 'text-[#9A5B00]' },
  blue: { card: 'bg-[#EAF1FB] border-[#DCE7F7]', chip: 'bg-[#D6E4F7]', icon: 'text-[#2D69B3]' },
  violet: { card: 'bg-[#F0EEFB] border-[#E4E0F7]', chip: 'bg-[#E1DCF6]', icon: 'text-[#5A45AE]' },
};

interface KpiCardProps {
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIcon;
  badge?: string;
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, tone, icon: Icon, badge, onClick }) => {
  const t = TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-[78px] w-full rounded-[14px] border ${t.card} px-3 2xl:px-3.5 flex items-center gap-2.5 2xl:gap-3.5 text-left transition hover:-translate-y-[1px] hover:shadow-[0_6px_16px_-8px_rgba(24,22,17,0.22)]`}
    >
      <span className={`w-[44px] h-[44px] 2xl:w-[50px] 2xl:h-[50px] rounded-full ${t.chip} flex items-center justify-center shrink-0`}>
        <Icon className={`w-[23px] h-[23px] 2xl:w-[26px] 2xl:h-[26px] ${t.icon}`} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[25px] 2xl:text-[27px] leading-none font-bold tracking-[-0.02em] text-[#181611] tabular-nums">
          {value}
        </span>
        <span className="block mt-1.5 text-[13.5px] 2xl:text-[15px] leading-tight text-[#363127] line-clamp-2">{label}</span>
      </span>
      {badge && (
        <span className="absolute top-2 right-2 2xl:top-2.5 2xl:right-3 px-2 py-[2px] rounded-full bg-[#FDC513] text-[#181611] text-[12px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
};

interface KpiCardsProps {
  target: number;
  completed: number;
  pendingReview: number;
  drafts: number;
  activeVolunteers: number;
  onNavigate: (path: string) => void;
}

export const KpiCards: React.FC<KpiCardsProps> = ({
  target,
  completed,
  pendingReview,
  drafts,
  activeVolunteers,
  onNavigate,
}) => {
  const pct = target > 0 ? Math.round((completed / target) * 100) : 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 xl:gap-4">
      <KpiCard label="Target Households" value={target} tone="gold" icon={UsersRound} onClick={() => onNavigate('/admin/clusters')} />
      <KpiCard label="Surveys Completed" value={completed} tone="goldDeep" icon={CircleCheckBig} badge={`${pct}%`} onClick={() => onNavigate('/admin/surveys')} />
      <KpiCard label="Pending Review" value={pendingReview} tone="amber" icon={Clock3} onClick={() => onNavigate('/admin/reviews')} />
      <KpiCard label="Drafts" value={drafts} tone="blue" icon={FileText} onClick={() => onNavigate('/admin/surveys')} />
      <div className="col-span-2 md:col-span-1">
        <KpiCard label="Active Volunteers" value={activeVolunteers} tone="violet" icon={Users} onClick={() => onNavigate('/admin/volunteers')} />
      </div>
    </div>
  );
};

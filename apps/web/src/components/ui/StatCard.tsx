import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: 'green' | 'emerald' | 'yellow' | 'blue' | 'purple';
  badge?: string;
  className?: string;
  onClick?: () => void;
}

const TONE_MAP: Record<
  NonNullable<StatCardProps['tone']>,
  { card: string; iconBg: string; badge: string }
> = {
  green: {
    card: 'bg-[#FFF9DC] border-[#F0DC84]',
    iconBg: 'bg-[#FDC513] text-[#181611]',
    badge: 'bg-[#F5E493] text-[#5C4100]',
  },
  emerald: {
    card: 'bg-[#FFF6CC] border-[#EAD068]',
    iconBg: 'bg-[#181611] text-[#FDC513]',
    badge: 'bg-[#F2DC78] text-[#4A3400]',
  },
  yellow: {
    card: 'bg-[#FDF6E5] border-[#F6E5BF]',
    iconBg: 'bg-[#FAEDCB] text-[#B7791F]',
    badge: 'bg-[#F8E2A9] text-[#8E5C08]',
  },
  blue: {
    card: 'bg-[#EFF5FD] border-[#DCE7F7]',
    iconBg: 'bg-[#DFECFC] text-[#2F64B3]',
    badge: 'bg-[#D8E7FC] text-[#245399]',
  },
  purple: {
    card: 'bg-[#F3EFFD] border-[#E4DCFA]',
    iconBg: 'bg-[#E6DDFB] text-[#6340B8]',
    badge: 'bg-[#DFD4FA] text-[#5232A0]',
  },
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  tone = 'green',
  badge,
  className = '',
  onClick,
}) => {
  const styles = TONE_MAP[tone];
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative w-full text-left rounded-2xl border px-3.5 py-3.5 sm:px-4 sm:py-4 transition-all duration-150 shadow-card ${styles.card} ${
        onClick ? 'hover:shadow-card-md hover:-translate-y-0.5 cursor-pointer' : ''
      } ${className}`}
    >
      {badge && (
        <span
          className={`absolute top-2.5 right-2.5 sm:top-3 sm:right-3 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${styles.badge}`}
        >
          {badge}
        </span>
      )}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${styles.iconBg}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1 pr-6 sm:pr-7">
          <div className="text-[22px] sm:text-[26px] font-extrabold text-[#181611] leading-none tracking-tight tabular-nums">
            {value}
          </div>
          <div className="text-[11px] sm:text-xs font-semibold text-[#4A4336] mt-1.5 leading-snug">
            {label}
          </div>
        </div>
      </div>
    </Wrapper>
  );
};

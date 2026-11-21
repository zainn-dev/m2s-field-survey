import React from 'react';
import { ArrowRight } from 'lucide-react';

interface PanelProps {
  title: React.ReactNode;
  /** Shown right after the title in muted text, e.g. "(from completed surveys)". */
  titleNote?: string;
  onViewAll?: () => void;
  viewAllLabel?: string;
  /** Extra content placed in the header between title and View All (e.g. tabs). */
  headerExtra?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

/** White dashboard card with the shared header row used by every widget. */
export const Panel: React.FC<PanelProps> = ({
  title,
  titleNote,
  onViewAll,
  viewAllLabel = 'View All',
  headerExtra,
  className = '',
  bodyClassName = '',
  children,
}) => (
  <section
    className={`bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)] flex flex-col min-w-0 ${className}`}
  >
    <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
      <h2 className="text-[18px] font-bold tracking-[-0.01em] text-[#181611] leading-tight truncate">
        {title}
        {titleNote && <span className="ml-1.5 text-[14px] font-medium text-[#5C5547]">{titleNote}</span>}
      </h2>
      {headerExtra}
      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold text-[#8C6200] hover:text-[#6E4D00]"
        >
          {viewAllLabel}
          <ArrowRight className="w-[15px] h-[15px]" strokeWidth={2.2} />
        </button>
      )}
    </header>
    <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
  </section>
);

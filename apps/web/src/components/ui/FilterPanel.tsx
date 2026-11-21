import React, { useState } from 'react';
import { ListFilter, RotateCcw, SlidersHorizontal } from 'lucide-react';

interface FilterPanelProps {
  children: React.ReactNode;
  onReset?: () => void;
  activeCount?: number;
  title?: string;
  /** Rendered at the right end of the bar (e.g. export buttons). */
  actions?: React.ReactNode;
  className?: string;
}

/** Shared class names so filter controls look the same on every admin page. */
export const filterLabelClass = 'block text-[11.5px] font-semibold text-[#5C5547] mb-1';
export const filterControlClass =
  'h-10 rounded-[10px] border border-[#E7E2D4] bg-white px-3 text-[13px] text-[#181611] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00]';

export const FilterPanel: React.FC<FilterPanelProps> = ({
  children,
  onReset,
  activeCount = 0,
  title = 'Filters',
  actions,
  className = '',
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className={`bg-white border border-[#E7E2D4] rounded-[14px] shadow-[0_1px_2px_rgba(24,22,17,0.04)] px-4 py-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-[#E7E2D4] text-[13px] font-semibold text-[#181611]"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#8C6200]" />
          {title}
          {activeCount > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] leading-5 bg-[#FDC513] text-[#181611]">
              {activeCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {onReset && activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 h-9 px-2 text-[12.5px] font-semibold text-[#5C5547] hover:text-[#181611]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
          {actions}
        </div>
      </div>

      <div className={`${mobileOpen ? 'mt-3 block' : 'hidden'} md:block`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="hidden md:flex items-center gap-1.5 h-10 text-[12.5px] font-semibold text-[#5C5547] mr-1">
            <ListFilter className="w-4 h-4 text-[#8C6200]" />
            <span>{title}</span>
          </div>
          {children}
          {onReset && activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="hidden md:inline-flex items-center gap-1.5 h-10 px-3 rounded-[10px] text-[12.5px] font-semibold text-[#5C5547] hover:bg-[#EFECE2] hover:text-[#181611] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset ({activeCount})
            </button>
          )}
          {actions && <div className="hidden md:flex items-end gap-2 ml-auto">{actions}</div>}
        </div>
      </div>
    </div>
  );
};

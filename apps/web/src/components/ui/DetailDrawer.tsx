import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  headerBadge?: React.ReactNode;
  /** Buttons shown in the header, left of the close button. */
  headerActions?: React.ReactNode;
  /** Content between the header and the scrolling body (e.g. tabs). */
  subheader?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  /** Ignore Escape / backdrop clicks (e.g. while a nested dialog is open). */
  dismissDisabled?: boolean;
  bodyClassName?: string;
}

/** Right-hand slide-over panel used for record details. */
export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  headerBadge,
  headerActions,
  subheader,
  children,
  footer,
  wide = false,
  dismissDisabled = false,
  bodyClassName = '',
}) => {
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShown(true));
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open || dismissDisabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissDisabled]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`absolute inset-0 bg-[#181611]/40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => !dismissDisabled && onClose()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative w-full ${
          wide ? 'sm:max-w-[860px]' : 'sm:max-w-[560px]'
        } h-full bg-[#FAF8F2] shadow-[0_0_48px_-12px_rgba(24,22,17,0.45)] flex flex-col outline-none transition-transform duration-200 ease-out ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="px-5 py-3.5 border-b border-[#E7E2D4] bg-white shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-[18px] font-bold tracking-[-0.01em] text-[#181611] truncate">{title}</h2>
                {headerBadge}
              </div>
              {subtitle && <div className="text-[12.5px] text-[#5C5547] mt-0.5">{subtitle}</div>}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="w-9 h-9 rounded-[10px] border border-[#E7E2D4] flex items-center justify-center text-[#5C5547] hover:bg-[#EFECE2] hover:text-[#181611] transition-colors"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        </div>
        {subheader && <div className="bg-white border-b border-[#E7E2D4] shrink-0">{subheader}</div>}

        <div className={`flex-1 overflow-y-auto p-4 sm:p-5 ${bodyClassName}`}>{children}</div>

        {footer && <div className="px-5 py-3 border-t border-[#E7E2D4] bg-white shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

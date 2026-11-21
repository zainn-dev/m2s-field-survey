import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** May be async: the dialog shows a busy state and stays open if the promise rejects. */
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Modal confirmation. When onConfirm returns a promise the confirm button spins and the
 * dialog cannot be dismissed until it settles; on rejection it stays open (the store has
 * already toasted the error) so the user can retry or cancel.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  requireReason = false,
  reasonLabel = 'Reason / Notes',
  reasonPlaceholder = 'Enter a specific reason (at least 5 characters)…',
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const tone =
    variant === 'danger'
      ? { btn: 'bg-[#C93B32] hover:bg-[#B0322A] text-white', icon: 'bg-[#FDECEA] text-[#C93B32]' }
      : variant === 'warning'
        ? { btn: 'bg-[#C77A0A] hover:bg-[#AD6908] text-white', icon: 'bg-[#FFF5E0] text-[#B26B00]' }
        : { btn: 'bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611]', icon: 'bg-[#FFF8D6] text-[#8C6200]' };
  const Icon = variant === 'primary' ? CheckCircle2 : AlertTriangle;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (requireReason && reason.trim().length < 5) {
      setError('Please provide a clear reason (at least 5 characters).');
      return;
    }
    const result = onConfirm(reason.trim());
    if (result && typeof (result as Promise<void>).then === 'function') {
      setBusy(true);
      try {
        await result;
      } catch {
        /* caller / store surfaces the error; keep the dialog open */
      } finally {
        if (mounted.current) setBusy(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#181611]/45 backdrop-blur-[1px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-[14px] border border-[#E7E2D4] shadow-xl overflow-hidden"
      >
        <div className="p-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone.icon}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="confirm-dialog-title" className="text-[16px] font-bold text-[#181611]">
                {title}
              </h3>
              <div className="text-[13.5px] text-[#5C5547] mt-1 leading-relaxed">{description}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-[#726C5D] hover:bg-[#EFECE2] disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {requireReason && (
          <div className="px-5 pb-4">
            <label htmlFor="confirm-reason" className="block text-[12.5px] font-semibold text-[#181611] mb-1.5">
              {reasonLabel} <span className="text-[#C93B32]">*</span>
            </label>
            <textarea
              id="confirm-reason"
              rows={3}
              autoFocus
              value={reason}
              disabled={busy}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError('');
              }}
              placeholder={reasonPlaceholder}
              className="w-full rounded-[10px] border border-[#E7E2D4] px-3 py-2.5 text-[14px] text-[#181611] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00]"
            />
            {error && <p className="text-[12px] text-[#C93B32] mt-1">{error}</p>}
          </div>
        )}

        <div className="px-5 py-3.5 bg-[#FAF8F2] border-t border-[#E7E2D4] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 px-4 rounded-[10px] border border-[#E7E2D4] bg-white text-[13.5px] font-semibold text-[#181611] hover:bg-[#EFECE2] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`h-10 px-4 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center gap-2 disabled:opacity-70 ${tone.btn}`}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useAppStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 md:bottom-5 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`rounded-xl border px-3.5 py-2.5 shadow-lg flex items-center gap-2.5 text-sm font-medium bg-white ${
            t.type === 'error'
              ? 'border-red-200 text-red-800'
              : t.type === 'info'
                ? 'border-blue-200 text-[#181611]'
                : 'border-[#D9AE00]/30 text-[#181611]'
          }`}
        >
          {t.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          ) : t.type === 'info' ? (
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#8C6200] shrink-0" />
          )}
          <span className="flex-1 text-xs sm:text-sm">{t.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="p-1 text-[#726C5D] hover:text-[#181611]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};


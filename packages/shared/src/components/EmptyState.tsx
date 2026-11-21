import React from 'react';
import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export const EmptyState: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /** Render without the card chrome (for use inside an existing card). */
  bare?: boolean;
  className?: string;
}> = ({ title, description, icon, action, bare = false, className = '' }) => (
  <div
    className={`${
      bare ? '' : 'bg-white border border-[#E7E2D4] rounded-[14px] shadow-[0_1px_2px_rgba(24,22,17,0.04)]'
    } px-6 py-10 text-center flex flex-col items-center justify-center ${className}`}
  >
    <div className="w-11 h-11 rounded-xl bg-[#FFF8D6] text-[#8C6200] flex items-center justify-center mb-3">
      {icon ?? <Inbox className="w-[22px] h-[22px]" strokeWidth={1.9} />}
    </div>
    <h3 className="text-[15px] font-semibold text-[#181611]">{title}</h3>
    <p className="text-[13px] text-[#5C5547] mt-1 max-w-md leading-relaxed">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading survey records…' }) => (
  <div className="bg-white border border-[#E7E2D4] rounded-[14px] p-10 flex flex-col items-center justify-center gap-3">
    <Loader2 className="w-7 h-7 text-[#8C6200] animate-spin" />
    <p className="text-[13px] font-medium text-[#5C5547]">{label}</p>
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = 'Unable to load data', message, onRetry }) => (
  <div className="bg-[#FFF6F5] border border-[#F5CFCB] rounded-[14px] p-6 flex flex-col items-center text-center">
    <AlertTriangle className="w-7 h-7 text-[#C93B32] mb-2" />
    <h3 className="text-[15px] font-semibold text-[#7A1F17]">{title}</h3>
    <p className="text-[13px] text-[#B42318] mt-1 max-w-md">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[#C93B32] text-white text-[13px] font-semibold hover:bg-[#B0322A] transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Retry
      </button>
    )}
  </div>
);

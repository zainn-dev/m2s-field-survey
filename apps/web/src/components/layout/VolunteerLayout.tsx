import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, CloudUpload, WifiOff } from 'lucide-react';
import { MobileNavigation } from './MobileNavigation';
import { useAppStore } from '../../store/appStore';

interface VolunteerLayoutProps {
  children: React.ReactNode;
  hideBottomNav?: boolean;
  /** When set, renders a sticky top app bar with this title. */
  title?: string;
  /** Shows a back button in the app bar. */
  onBack?: () => void;
  /** Right-aligned app-bar content (buttons, badges). */
  actions?: React.ReactNode;
}

/**
 * Responsive shell for the volunteer field app: full-width on phones, a centred
 * column on larger screens. Optional sticky app bar, connectivity / pending-sync
 * banner and bottom tab bar.
 */
export const VolunteerLayout: React.FC<VolunteerLayoutProps> = ({
  children,
  hideBottomNav = false,
  title,
  onBack,
  actions,
}) => {
  const { isOnline, pendingCount, isAuthenticated } = useAppStore();
  const location = useLocation();
  const onSyncPage = location.pathname.startsWith('/volunteer/sync');
  const showBanner = !onSyncPage && (!isOnline || (isAuthenticated && pendingCount > 0));
  const hasAppBar = Boolean(title || onBack || actions);

  return (
    <div className="admin-shell min-h-screen bg-[#FAF8F2] text-[#181611]">
      <div className="mx-auto w-full max-w-[480px] min-h-screen flex flex-col bg-[#FAF8F2] sm:border-x sm:border-[#E7E2D4]">
        {hasAppBar && (
          <header
            className="sticky top-0 z-30 bg-[#FDC513] text-[#181611] shadow-[0_1px_0_rgba(24,22,17,0.1)]"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="h-14 px-2 flex items-center gap-1">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Go back"
                  className="w-10 h-10 rounded-[10px] flex items-center justify-center hover:bg-[#181611]/10 transition shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <span className="w-2 shrink-0" />
              )}
              <h1 className="flex-1 min-w-0 truncate text-[16px] font-semibold tracking-tight">{title}</h1>
              {actions && <div className="flex items-center gap-1.5 shrink-0 pr-1">{actions}</div>}
            </div>
          </header>
        )}

        {showBanner && (
          <Link
            to="/volunteer/sync"
            className={`flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-medium border-b transition ${
              !isOnline
                ? 'bg-[#FFF5E0] text-[#7A4D00] border-[#F3DFB5] hover:bg-[#FFEFD0]'
                : 'bg-[#FEF8E6] text-[#7A5A00] border-[#F2E4B3] hover:bg-[#FDF2D2]'
            }`}
          >
            {!isOnline ? <WifiOff className="w-4 h-4 shrink-0" /> : <CloudUpload className="w-4 h-4 shrink-0" />}
            <span className="flex-1 min-w-0">
              {!isOnline ? (
                <>
                  <strong className="font-semibold">You are offline.</strong> Work is saved on this device
                  {pendingCount > 0 ? ` (${pendingCount} waiting to sync).` : '.'}
                </>
              ) : (
                <>
                  <strong className="font-semibold">{pendingCount}</strong> item{pendingCount === 1 ? '' : 's'} waiting to
                  sync.
                </>
              )}
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
          </Link>
        )}

        <main className="flex-1 flex flex-col min-w-0">{children}</main>

        {!hideBottomNav && <MobileNavigation />}
      </div>
    </div>
  );
};

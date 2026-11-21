import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  Home,
  Info,
  RefreshCw,
  User,
  Wifi,
  WifiOff,
  X,
  AlertCircle,
} from 'lucide-react';
import { LanguageToggle } from '@m2s/shared/components/LanguageToggle';
import { Miles2SmileLogo } from '@m2s/shared/components/Miles2SmileLogo';
import { useMobileStore } from '../store/mobileStore';

interface MobileLayoutProps {
  title?: string;
  backTo?: string;
  showBottomNav?: boolean;
  children: React.ReactNode;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({
  title,
  backTo,
  showBottomNav = true,
  children,
}) => {
  const navigate = useNavigate();
  const { isOnline, pendingCount, syncState, language, setLanguage, toasts, dismissToast } = useMobileStore();
  const hi = language === 'hi';

  const navItems = [
    { to: '/dashboard', label: hi ? 'होम' : 'Home', icon: Home },
    { to: '/surveys', label: hi ? 'सर्वे' : 'Surveys', icon: ClipboardList },
    { to: '/documents', label: hi ? 'दस्तावेज़' : 'Docs', icon: Camera },
    { to: '/sync', label: hi ? 'सिंक' : 'Sync', icon: RefreshCw, badge: pendingCount },
    { to: '/profile', label: hi ? 'प्रोफ़ाइल' : 'Profile', icon: User },
  ];

  return (
    <div className="min-h-dvh bg-[#FAF8F2] text-[#181611] flex flex-col max-w-[540px] mx-auto shadow-[0_0_40px_rgba(24,22,17,0.06)]">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 bg-[#FDC513] text-[#181611] pt-[env(safe-area-inset-top)] border-b border-[#E5BC00] shadow-sm">
        <div className="h-[60px] px-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {backTo ? (
              <button
                type="button"
                onClick={() => navigate(backTo)}
                className="w-9 h-9 rounded-xl bg-[#181611]/10 hover:bg-[#181611]/15 grid place-items-center shrink-0 text-[#181611]"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <Link to="/dashboard" className="shrink-0">
                <Miles2SmileLogo variant="onGold" compact showFoundation={false} />
              </Link>
            )}
            {title && <h1 className="text-[15.5px] font-extrabold truncate tracking-tight text-[#181611]">{title}</h1>}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              to="/sync"
              className={`h-8 px-2.5 rounded-full text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition ${
                isOnline
                  ? pendingCount > 0
                    ? 'bg-[#181611] text-[#FDC513]'
                    : 'bg-[#181611]/10 text-[#181611]'
                  : 'bg-[#B42318] text-white'
              }`}
              title="Connectivity & Sync status"
            >
              {syncState.running ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : isOnline ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>
                {syncState.running
                  ? hi
                    ? 'सिंक…'
                    : 'Syncing'
                  : !isOnline
                  ? hi
                    ? 'ऑफ़लाइन'
                    : 'Offline'
                  : pendingCount > 0
                  ? `${pendingCount}`
                  : hi
                  ? 'ऑनलाइन'
                  : 'Online'}
              </span>
            </Link>

            <LanguageToggle language={language} onChange={setLanguage} compact />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 px-3.5 pt-3.5 ${showBottomNav ? 'pb-24' : 'pb-6'} space-y-3.5`}>{children}</main>

      {/* Toast Stack */}
      {toasts.length > 0 && (
        <div
          className={`fixed left-1/2 -translate-x-1/2 z-50 w-[min(calc(100%-24px),500px)] space-y-2 pointer-events-none ${
            showBottomNav ? 'bottom-[74px]' : 'bottom-4'
          }`}
        >
          {toasts.map((t) => {
            const cls =
              t.type === 'success'
                ? 'bg-[#181611] text-[#FDC513] border-[#FDC513]/40'
                : t.type === 'error'
                ? 'bg-[#B42318] text-white border-[#F04438]'
                : 'bg-[#2C281F] text-white border-[#474235]';
            const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertCircle : Info;
            return (
              <div
                key={t.id}
                role="status"
                className={`pointer-events-auto rounded-[12px] border px-3.5 py-2.5 shadow-lg flex items-start gap-2.5 text-[13px] ${cls}`}
              >
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1 leading-snug">{t.text}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  aria-label="Dismiss notification"
                  className="opacity-75 hover:opacity-100 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Tab Navigation (Volunteers Only) */}
      {showBottomNav && (
        <nav
          aria-label="Volunteer navigation"
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[540px] z-30 bg-white border-t border-[#DFD9C8] pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(24,22,17,0.06)]"
        >
          <div className="grid grid-cols-5 h-16">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                      isActive ? 'text-[#181611]' : 'text-[#625C4E] hover:text-[#181611]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`relative px-3 py-1 rounded-full transition ${
                          isActive ? 'bg-[#FDC513] text-[#181611]' : ''
                        }`}
                      >
                        <Icon className={`w-5 h-5 ${item.to === '/sync' && syncState.running ? 'animate-spin' : ''}`} />
                        {typeof item.badge === 'number' && item.badge > 0 && (
                          <span className="absolute -top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#D97706] text-white text-[10px] font-bold grid place-items-center">
                            {item.badge}
                          </span>
                        )}
                      </span>
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
};


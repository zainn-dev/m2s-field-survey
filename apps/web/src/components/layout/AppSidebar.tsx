import React, { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  Download,
  FolderOpen,
  Home,
  MapPin,
  Settings,
  Smartphone,
  SquareCheckBig,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { STUDY_META } from '../../data/questionnaire';
import { ADMIN_LOGO_SRC } from '../ui/Miles2SmileLogo';

interface AppSidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ mobileOpen, onCloseMobile }) => {
  const { currentUser, documents, surveys } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onCloseMobile]);

  const pendingReviewCount = surveys.filter((s) => s.status === 'SUBMITTED').length;
  // "Lutumari Reserve Forest Eviction Study • Nagaon, Assam" → two lines like the brand panel
  const splitAt = STUDY_META.studyTitle.indexOf(' Eviction');
  const studyPlace = splitAt > 0 ? STUDY_META.studyTitle.slice(0, splitAt) : STUDY_META.studyTitle;
  const studyRegion = splitAt > 0 ? STUDY_META.studyTitle.slice(splitAt + 1) : '';

  const navItems: {
    to: string;
    label: string;
    icon: LucideIcon;
    end?: boolean;
    badge?: number;
  }[] = [
    { to: '/admin', label: 'Dashboard', icon: Home, end: true },
    { to: '/admin/surveys', label: 'Households / Surveys', icon: ClipboardList },
    { to: '/admin/documents', label: 'Documents', icon: FolderOpen, badge: documents.length },
    { to: '/admin/volunteers', label: 'Volunteers', icon: Users },
    { to: '/admin/reviews', label: 'Review & Approval', icon: SquareCheckBig, badge: pendingReviewCount },
    { to: '/admin/analytics', label: 'Analytics & Reports', icon: BarChart3 },
    { to: '/admin/exports', label: 'Exports', icon: Download },
    { to: '/admin/clusters', label: 'Clusters / Villages', icon: MapPin },
    ...(currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN'
      ? [{ to: '/admin/users', label: 'Users & Roles', icon: UserRound }]
      : []),
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  const initials = currentUser.name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const roleLabel = currentUser.role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');

  const content = (
    <aside className="relative w-[242px] h-full flex flex-col bg-[#191712] bg-gradient-to-b from-[#211E16] to-[#13110C] text-white select-none border-r border-[#2B261C]">
      <button
        type="button"
        onClick={onCloseMobile}
        aria-label="Close navigation menu"
        className="lg:hidden absolute top-3 right-3 p-1.5 rounded-lg text-white/80 hover:bg-white/10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Brand */}
      <div className="shrink-0 px-5 pt-4 text-center">
        <div className="flex justify-center">
          <img
            src={ADMIN_LOGO_SRC}
            alt="Miles 2 Smile — Gateway to Happiness"
            className="h-[86px] w-[86px] rounded-full object-contain select-none shadow-sm"
          />
        </div>

        <div className="mt-3 text-[16.5px] font-bold tracking-[-0.01em] text-[#FDC513]">{STUDY_META.appName}</div>
        <div className="mt-1 text-[12px] leading-[1.35] text-white/75">
          {studyPlace}
          <br />
          {studyRegion}
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Admin navigation" className="flex-1 min-h-0 overflow-y-auto px-2.5 pt-3.5 pb-3 space-y-[2px]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onCloseMobile}
              className={({ isActive }) =>
                `group flex items-center gap-3 h-[37px] px-3 rounded-[9px] text-[13.5px] transition-colors ${
                  isActive
                    ? 'bg-[#FDC513] text-[#181611] font-semibold shadow-sm'
                    : 'text-white/85 font-medium hover:bg-white/[0.08]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`min-w-[24px] h-[20px] px-1.5 rounded-full text-[11px] font-bold leading-[20px] text-center tabular-nums ${
                        isActive ? 'bg-[#181611] text-[#FDC513]' : 'bg-[#FDC513] text-[#181611]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}

        <div className="lg:hidden pt-3 mt-3 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              navigate('/volunteer');
            }}
            className="w-full flex items-center gap-3 h-[38px] px-3.5 rounded-[9px] text-[13.5px] font-medium text-[#FDC513] hover:bg-white/[0.07]"
          >
            <Smartphone className="w-[18px] h-[18px]" />
            Volunteer Mobile App
          </button>
        </div>
      </nav>

      {/* Current user */}
      <div className="shrink-0 mx-4 border-t border-white/15" />
      <button
        type="button"
        onClick={() => {
          onCloseMobile();
          navigate('/admin/settings');
        }}
        className="shrink-0 mx-2.5 my-2.5 flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.07] text-left"
      >
        <span className="w-10 h-10 rounded-full bg-[#FDC513] text-[#181611] flex items-center justify-center text-[14px] font-bold shrink-0">
          {initials}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold truncate">{currentUser.name}</span>
          <span className="block text-[12.5px] text-white/80 truncate">{roleLabel}</span>
        </span>
        <ChevronRight className="w-[18px] h-[18px] text-white/85 shrink-0" />
      </button>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block w-[242px] shrink-0" aria-hidden="true" />
      <div className="hidden lg:block fixed inset-y-0 left-0 z-30 w-[242px] h-dvh">{content}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true">
          <div className="relative z-10 h-full shadow-2xl">{content}</div>
          <div className="flex-1 bg-black/45" onClick={onCloseMobile} />
        </div>
      )}
    </>
  );
};

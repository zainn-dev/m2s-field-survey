import React from 'react';
import { NavLink } from 'react-router-dom';
import { ClipboardList, CloudUpload, FolderOpen, Home, User } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

export const MobileNavigation: React.FC = () => {
  const { pendingCount, language } = useAppStore();
  const hi = language === 'hi';

  const tabs = [
    { to: '/volunteer', label: hi ? 'होम' : 'Home', icon: Home, end: true },
    { to: '/volunteer/surveys', label: hi ? 'सर्वे' : 'Surveys', icon: ClipboardList },
    { to: '/volunteer/documents', label: hi ? 'दस्तावेज़' : 'Documents', icon: FolderOpen },
    { to: '/volunteer/sync', label: hi ? 'सिंक' : 'Sync', icon: CloudUpload, badge: pendingCount },
    { to: '/volunteer/profile', label: hi ? 'प्रोफ़ाइल' : 'Profile', icon: User },
  ];

  return (
    <nav
      aria-label="Volunteer navigation"
      className="sticky bottom-0 z-30 bg-white border-t border-[#E7E2D4] shadow-[0_-2px_10px_rgba(24,22,17,0.05)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5 px-1 pt-1.5 pb-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `relative h-[52px] rounded-[10px] flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
                  isActive ? 'text-[#181611]' : 'text-[#726C5D] hover:text-[#181611]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex items-center justify-center w-12 h-7 rounded-full transition ${
                      isActive ? 'bg-[#FDC513] text-[#181611]' : ''
                    }`}
                  >
                    <Icon className="w-[19px] h-[19px]" strokeWidth={isActive ? 2.4 : 2} />
                    {typeof tab.badge === 'number' && tab.badge > 0 && (
                      <span className="absolute -top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C77A0A] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </span>
                    )}
                  </span>
                  <span className="truncate max-w-full leading-none">{tab.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

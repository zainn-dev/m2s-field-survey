import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, History, LogOut, Menu, Search, Settings, Smartphone, X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { StatusBadge } from '../ui/StatusBadge';

interface TopHeaderProps {
  title: string;
  subtitle?: string;
  onOpenMenu: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ title, subtitle, onOpenMenu }) => {
  const { currentUser, surveys, notifications, markNotificationsRead, logout, notify } =
    useAppStore();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMobileSearchOpen(true);
        setTimeout(() => searchRef.current?.focus(), 30);
      } else if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
        setQuery('');
        searchRef.current?.blur();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setProfileOpen(false);
        setSearchFocused(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return surveys
      .filter(
        (s) =>
          s.surveyCode.toLowerCase().includes(q) ||
          s.profile.headName.toLowerCase().includes(q) ||
          s.clusterName.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [query, surveys]);

  const unreadCount = notifications.filter((n) => n.unread).length;
  const avatarLetter = 'M'; // Miles2Smile org avatar, as in the brand header

  const goTo = (path: string) => {
    setNotifOpen(false);
    setProfileOpen(false);
    navigate(path);
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 bg-white border-b border-[#E7E2D4] px-4 sm:px-6 lg:px-8"
    >
      <div className="h-[76px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open menu"
            className="lg:hidden w-10 h-10 rounded-xl border border-[#E7E2D4] flex items-center justify-center text-[#181611] hover:bg-[#EFECE2] shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[30px] leading-[1.1] font-bold tracking-[-0.02em] text-[#181611] truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="hidden sm:block mt-1 text-[14.5px] text-[#5C5547] truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5 shrink-0">
          {/* Search (desktop) */}
          <div className="relative hidden md:block w-[300px] xl:w-[410px]">
            <label className="flex items-center gap-2.5 h-[42px] pl-3.5 pr-2 rounded-xl border border-[#DFD9C8] bg-white focus-within:border-[#D9AE00] focus-within:ring-2 focus-within:ring-[#FDC513]/30 transition">
              <Search className="w-[19px] h-[19px] text-[#363127] shrink-0" strokeWidth={2} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Search by Survey ID, name or village..."
                aria-label="Global search"
                className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-[#181611] placeholder:text-[#625C4E]"
              />
              <kbd className="px-2 h-[24px] leading-[24px] rounded-md bg-[#F3EFE3] text-[11.5px] font-medium text-[#474235] font-sans">
                Ctrl K
              </kbd>
            </label>
            {searchFocused && results.length > 0 && (
              <SearchResults
                results={results}
                onPick={(id) => {
                  setQuery('');
                  setSearchFocused(false);
                  navigate(`/admin/surveys?focus=${id}`);
                }}
              />
            )}
          </div>

          {/* Search (mobile toggle) */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="Search households"
            className="md:hidden w-10 h-10 rounded-full flex items-center justify-center text-[#181611] hover:bg-[#EFECE2]"
          >
            {mobileSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen((v) => !v);
                setProfileOpen(false);
              }}
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative w-10 h-10 rounded-full flex items-center justify-center text-[#181611] hover:bg-[#EFECE2] transition"
            >
              <Bell className="w-[22px] h-[22px]" strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span className="absolute top-[7px] right-[8px] w-[9px] h-[9px] rounded-full bg-[#F5B800] ring-2 ring-white" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-[min(340px,calc(100vw-2rem))] bg-white rounded-2xl border border-[#E7E2D4] shadow-[0_16px_40px_-12px_rgba(24,22,17,0.25)] z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#EFECE2] flex items-center justify-between">
                  <span className="text-[13px] font-bold">Notifications</span>
                  <button
                    type="button"
                    onClick={markNotificationsRead}
                    className="text-[12px] font-semibold text-[#8C6200] hover:underline"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-[#EFECE2]">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => goTo(n.linkTo)}
                      className="w-full text-left px-4 py-3 hover:bg-[#FAF8F2] flex gap-3"
                    >
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          n.unread ? 'bg-[#F5B800]' : 'bg-[#DFD9C8]'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-[#181611]">{n.title}</span>
                        <span className="block text-[12px] text-[#5C5547] mt-0.5">{n.detail}</span>
                        <span className="block text-[11px] text-[#8E8675] mt-1">{n.time}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((v) => !v);
                setNotifOpen(false);
              }}
              aria-label="Profile menu"
              className="w-[46px] h-[46px] rounded-full bg-[#FDC513] text-[#181611] text-[19px] font-bold flex items-center justify-center hover:bg-[#E5B00D] border border-[#E0AC00] transition"
            >
              {avatarLetter}
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-[min(270px,calc(100vw-2rem))] bg-white rounded-2xl border border-[#E7E2D4] shadow-[0_16px_40px_-12px_rgba(24,22,17,0.25)] z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#EFECE2]">
                  <div className="text-[14px] font-bold">{currentUser.name}</div>
                  <div className="text-[12px] text-[#5C5547] truncate">{currentUser.email}</div>
                  <div className="mt-2">
                    <StatusBadge status={currentUser.role} />
                  </div>
                </div>
                <div className="p-2 text-[13px]">
                  <MenuItem icon={Smartphone} label="Open Field App" onClick={() => goTo('/volunteer')} />
                  <MenuItem icon={History} label="Audit Log" onClick={() => goTo('/admin/audit')} />
                  <MenuItem icon={Settings} label="Account & Settings" onClick={() => goTo('/admin/settings')} />
                  <MenuItem
                    icon={LogOut}
                    label="Sign out"
                    danger
                    onClick={async () => {
                      let ok = await logout();
                      if (!ok) {
                        if (!window.confirm('Some field work on this device has not synced yet. Sign out anyway and discard it?')) return;
                        ok = await logout({ force: true });
                      }
                      notify('Signed out.', 'info');
                      goTo('/admin/login');
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search row */}
      {mobileSearchOpen && (
        <div className="md:hidden relative pb-3">
          <label className="flex items-center gap-2.5 h-[42px] px-3.5 rounded-xl border border-[#E7E2D4] bg-white">
            <Search className="w-[18px] h-[18px] text-[#363127]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Search by Survey ID, name or village..."
              aria-label="Mobile global search"
              className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-[#726C5D]"
            />
          </label>
          {results.length > 0 && (
            <SearchResults
              results={results}
              onPick={(id) => {
                setQuery('');
                setMobileSearchOpen(false);
                navigate(`/admin/surveys?focus=${id}`);
              }}
            />
          )}
        </div>
      )}
    </header>
  );
};

const SearchResults: React.FC<{
  results: ReturnType<typeof useAppStore>['surveys'];
  onPick: (id: string) => void;
}> = ({ results, onPick }) => (
  <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl border border-[#E7E2D4] shadow-[0_16px_40px_-12px_rgba(24,22,17,0.25)] z-40 overflow-hidden">
    <div className="px-3.5 py-2 text-[11px] font-semibold text-[#5C5547] border-b border-[#EFECE2]">
      {results.length} matching household{results.length === 1 ? '' : 's'}
    </div>
    {results.map((s) => (
      <button
        key={s.id}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(s.id)}
        className="w-full px-3.5 py-2.5 text-left hover:bg-[#FAF8F2] flex items-center justify-between gap-2"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold truncate">
            {s.surveyCode} · {s.profile.headName}
          </span>
          <span className="block text-[11.5px] text-[#5C5547]">{s.clusterName}</span>
        </span>
        <StatusBadge status={s.status} />
      </button>
    ))}
  </div>
);

const MenuItem: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}> = ({ icon: Icon, label, onClick, danger }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full px-2.5 py-2 rounded-lg text-left flex items-center gap-2.5 font-medium ${
      danger ? 'text-red-600 hover:bg-red-50' : 'text-[#181611] hover:bg-[#EFECE2]'
    }`}
  >
    <Icon className={`w-4 h-4 ${danger ? '' : 'text-[#8C6200]'}`} />
    {label}
  </button>
);

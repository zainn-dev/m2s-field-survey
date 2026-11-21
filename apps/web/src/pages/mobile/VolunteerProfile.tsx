import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LayoutDashboard, Loader2, LogOut, Mail, MapPin, Phone } from 'lucide-react';
import { VolunteerLayout } from '../../components/layout/VolunteerLayout';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAppStore } from '../../store/appStore';
import type { Language } from '../../types/survey';

const card = 'bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)]';
const inputCls =
  'w-full h-11 px-3 rounded-[10px] border border-[#E7E2D4] bg-white text-[14px] text-[#181611] placeholder:text-[#8E8675] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2] transition';

function validateNewPassword(current: string, next: string, confirm: string): string {
  if (!current) return 'Enter your current password.';
  if (next.length < 10) return 'New password must be at least 10 characters.';
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return 'New password must contain both letters and numbers.';
  if (next === current) return 'New password must be different from the current one.';
  if (next !== confirm) return 'New password and confirmation do not match.';
  return '';
}

export const VolunteerProfile: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, clusters, language, setLanguage, logout, changePassword, notify, pendingCount } = useAppStore();
  const hi = language === 'hi';

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);
  const [unsyncedPrompt, setUnsyncedPrompt] = useState<number | null>(null);

  const clusterNames = clusters.filter((c) => currentUser.assignedClusterIds.includes(c.id)).map((c) => c.name);
  const initials =
    currentUser.name
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwBusy) return;
    const err = validateNewPassword(current, next, confirm);
    setPwError(err);
    if (err) return;
    setPwBusy(true);
    try {
      await changePassword(current, next);
      notify('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (ex) {
      setPwError(ex instanceof Error && ex.message ? ex.message : 'Could not change the password.');
    } finally {
      setPwBusy(false);
    }
  };

  const signOut = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const ok = await logout();
      if (ok) {
        navigate('/volunteer/login', { replace: true });
        return;
      }
      setUnsyncedPrompt(Math.max(pendingCount, 1));
    } catch {
      notify('Sign out failed. Please try again.', 'error');
    } finally {
      setLoggingOut(false);
    }
  };

  const forceSignOut = async () => {
    await logout({ force: true });
    setUnsyncedPrompt(null);
    navigate('/volunteer/login', { replace: true });
  };

  const infoRows: { icon: React.ElementType; label: string; value: React.ReactNode }[] = [
    { icon: Mail, label: 'Email', value: currentUser.email || '—' },
    { icon: Phone, label: 'Mobile', value: currentUser.mobile || '—' },
    {
      icon: MapPin,
      label: 'Clusters',
      value: clusterNames.length ? clusterNames.join(', ') : 'None assigned',
    },
  ];

  return (
    <VolunteerLayout title={hi ? 'प्रोफ़ाइल' : 'Profile'}>
      <div className="px-4 py-4 space-y-4 flex-1">
        {/* Identity */}
        <section className={`${card} p-4`}>
          <div className="flex items-center gap-3.5">
            <span className="w-14 h-14 rounded-full bg-[#FFF8D6] text-[#5C4100] flex items-center justify-center text-[18px] font-bold shrink-0">
              {initials}
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-[#181611] truncate">{currentUser.name}</h2>
              <div className="mt-1">
                <StatusBadge status={currentUser.role} />
              </div>
            </div>
          </div>
          <dl className="mt-4 divide-y divide-[#EFECE2] border-t border-[#EFECE2]">
            {infoRows.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.label} className="py-2.5 flex items-start gap-3 text-[13.5px]">
                  <dt className="w-24 shrink-0 text-[#726C5D] inline-flex items-center gap-1.5">
                    <Icon className="w-4 h-4 text-[#8C6200]" />
                    {r.label}
                  </dt>
                  <dd className="flex-1 min-w-0 text-[#181611] font-medium break-words">{r.value}</dd>
                </div>
              );
            })}
            {typeof currentUser.targetHouseholds === 'number' && currentUser.targetHouseholds > 0 && (
              <div className="py-2.5 flex items-start gap-3 text-[13.5px]">
                <dt className="w-24 shrink-0 text-[#726C5D] pl-[22px]">Target</dt>
                <dd className="flex-1 text-[#181611] font-medium">{currentUser.targetHouseholds} households</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Language */}
        <section className={`${card} p-4`}>
          <label htmlFor="vp-lang" className="block text-[14px] font-semibold text-[#181611]">
            {hi ? 'भाषा' : 'Language'}
          </label>
          <p className="text-[12.5px] text-[#726C5D] mt-0.5">Default language for survey questions.</p>
          <select
            id="vp-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className={`${inputCls} mt-2.5`}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
          </select>
        </section>

        {/* Change password */}
        <section className={`${card} p-4`}>
          <h2 className="text-[14px] font-semibold text-[#181611] inline-flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#8C6200]" />
            {hi ? 'पासवर्ड बदलें' : 'Change password'}
          </h2>
          <form onSubmit={submitPassword} noValidate className="mt-3 space-y-3">
            <div>
              <label htmlFor="vp-current" className="block text-[12.5px] font-semibold text-[#181611] mb-1">
                Current password
              </label>
              <input
                id="vp-current"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={current}
                disabled={pwBusy}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  setPwError('');
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="vp-new" className="block text-[12.5px] font-semibold text-[#181611] mb-1">
                New password
              </label>
              <div className="relative">
                <input
                  id="vp-new"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={next}
                  disabled={pwBusy}
                  onChange={(e) => {
                    setNext(e.target.value);
                    setPwError('');
                  }}
                  className={`${inputCls} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide passwords' : 'Show passwords'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[8px] flex items-center justify-center text-[#726C5D] hover:text-[#181611] hover:bg-[#EFECE2]"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11.5px] text-[#726C5D] mt-1">At least 10 characters, with letters and numbers.</p>
            </div>
            <div>
              <label htmlFor="vp-confirm" className="block text-[12.5px] font-semibold text-[#181611] mb-1">
                Confirm new password
              </label>
              <input
                id="vp-confirm"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                disabled={pwBusy}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setPwError('');
                }}
                className={inputCls}
              />
            </div>
            {pwError && (
              <p role="alert" className="text-[12.5px] text-[#C93B32]">
                {pwError}
              </p>
            )}
            <button
              type="submit"
              disabled={pwBusy}
              className="h-10 px-4 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-70 text-[#181611] text-[13.5px] font-semibold inline-flex items-center gap-2"
            >
              {pwBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              Update password
            </button>
          </form>
        </section>

        {/* Actions */}
        <div className="space-y-2.5">
          {currentUser.role !== 'VOLUNTEER' && (
            <Link
              to="/admin"
              className="w-full h-11 rounded-[10px] bg-[#181611] hover:bg-[#2C281F] text-[#FDC513] text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition"
            >
              <LayoutDashboard className="w-4 h-4" />
              Open Admin Console
            </Link>
          )}
          <button
            type="button"
            onClick={signOut}
            disabled={loggingOut}
            className="w-full h-11 rounded-[10px] border border-[#F2C9C5] bg-white hover:bg-[#FDECEA] disabled:opacity-70 text-[#C93B32] text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition"
          >
            {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {hi ? 'साइन आउट' : 'Sign out'}
          </button>
          {pendingCount > 0 && (
            <p className="text-[12px] text-[#9A6800] text-center">
              {pendingCount} item{pendingCount === 1 ? '' : 's'} not synced yet.{' '}
              <Link to="/volunteer/sync" className="font-semibold underline">
                Sync first
              </Link>
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={unsyncedPrompt !== null}
        variant="danger"
        title="Sign out and lose unsynced work?"
        description={
          <>
            {unsyncedPrompt} unsynced item{unsyncedPrompt === 1 ? '' : 's'} on this device will be permanently lost if you sign
            out now. Sync first if you can.
          </>
        }
        confirmLabel="Sign out anyway"
        cancelLabel="Stay signed in"
        onConfirm={forceSignOut}
        onCancel={() => setUnsyncedPrompt(null)}
      />
    </VolunteerLayout>
  );
};

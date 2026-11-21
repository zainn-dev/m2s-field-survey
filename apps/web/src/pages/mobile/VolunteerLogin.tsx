import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Download, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { VolunteerLayout } from '../../components/layout/VolunteerLayout';
import { Miles2SmileLogo } from '../../components/ui/Miles2SmileLogo';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { postLoginPath, SessionLoader } from '../../components/layout/RequireAuth';
import { useAppStore } from '../../store/appStore';

const inputCls =
  'w-full h-11 pl-10 rounded-[10px] border border-[#E7E2D4] bg-white text-[14px] text-[#181611] placeholder:text-[#8E8675] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/45 focus:border-[#D9AE00] disabled:bg-[#FAF8F2] transition';

export const VolunteerLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { authStatus, currentUser, login, language, setLanguage } = useAppStore();
  const hi = language === 'hi';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (authStatus === 'loading') return <SessionLoader />;
  if (authStatus === 'ready' && currentUser.id && !busy) {
    return <Navigate to={postLoginPath(location.search, 'volunteer', currentUser.role)} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const id = identifier.trim();
    if (!id || !password) {
      setError('Enter your email or mobile number and your password.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const user = await login(id, password, 'volunteer');
      navigate(postLoginPath(location.search, 'volunteer', user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Sign-in failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <VolunteerLayout hideBottomNav>
      <div className="flex-1 flex flex-col">
        <div
          className="bg-[#FDC513] px-5 pt-4 pb-8 text-[#181611]"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
        >
          <div className="flex justify-end">
            <div className="bg-white rounded-xl border border-[#181611]/10">
              <LanguageToggle language={language} onChange={setLanguage} compact />
            </div>
          </div>

          <div className="flex flex-col items-center text-center mt-4">
            <Miles2SmileLogo showFoundation={false} variant="onGold" />
            <h1 className="mt-4 text-[22px] font-bold tracking-tight text-[#181611]">
              {hi ? 'स्वयंसेवक लॉगिन' : 'Volunteer sign in'}
            </h1>
            <p className="mt-1 text-[13.5px] font-medium text-[#181611]/75">M2S Field Survey · Lutumari, Nagaon</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col px-5 pb-8">
          <form
            onSubmit={onSubmit}
            noValidate
            className="-mt-4 bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_6px_20px_-6px_rgba(24,22,17,0.12)] p-5 space-y-4"
          >
            <div>
              <label htmlFor="vl-identifier" className="block text-[13px] font-semibold text-[#181611] mb-1.5">
                Email or mobile number
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#726C5D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="vl-identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={identifier}
                  disabled={busy}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="name@example.org or 10-digit mobile"
                  className={`${inputCls} pr-3`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="vl-password" className="block text-[13px] font-semibold text-[#181611] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#726C5D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="vl-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  disabled={busy}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Your password"
                  className={`${inputCls} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-[8px] flex items-center justify-center text-[#726C5D] hover:text-[#181611] hover:bg-[#FAF8F2]"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-[10px] border border-[#F2C9C5] bg-[#FDECEA] px-3 py-2.5 text-[13px] text-[#C93B32]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-70 text-[#181611] text-[14px] font-semibold inline-flex items-center justify-center gap-2 shadow-[0_2px_8px_rgba(255,213,19,0.35)] transition"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Signing in…' : hi ? 'साइन इन करें' : 'Sign in'}
            </button>

            <p className="text-[12.5px] text-[#726C5D] text-center leading-relaxed">
              Accounts are created by your project admin. Forgot your password? Ask your admin to reset it.
            </p>
          </form>

          <div className="mt-5 rounded-[12px] border border-[#E7E2D4] bg-[#FFFDF5] p-3 text-center">
            <p className="text-[12.5px] font-semibold text-[#181611] mb-1.5">
              {hi ? 'एंड्रॉयड मोबाइल ऐप (APK)' : 'Volunteer Android App (APK)'}
            </p>
            <a
              href="/m2s-field-survey.apk"
              download="M2S-Field-Survey.apk"
              className="w-full h-10 rounded-[8px] bg-[#181611] hover:bg-[#2C2920] text-white text-[13px] font-medium inline-flex items-center justify-center gap-2 shadow-sm transition"
            >
              <Download className="w-4 h-4 text-[#FDC513]" />
              {hi ? 'M2S-Field-Survey.apk डाउनलोड करें (7.4 MB)' : 'Download APK (7.4 MB)'}
            </a>
          </div>

          <div className="mt-auto pt-8 text-center text-[13px] text-[#5C5547]">
            Admin or supervisor?{' '}
            <Link to="/admin/login" className="font-semibold text-[#8C6200] hover:underline">
              Open the Admin Console
            </Link>
          </div>
        </div>
      </div>
    </VolunteerLayout>
  );
};

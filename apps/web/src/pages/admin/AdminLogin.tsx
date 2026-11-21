import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, ShieldCheck, Smartphone, User } from 'lucide-react';
import { Miles2SmileLogo } from '../../components/ui/Miles2SmileLogo';
import { postLoginPath, SessionLoader } from '../../components/layout/RequireAuth';
import { useAppStore } from '../../store/appStore';
import { ApiError } from '../../api/http';
import { STUDY_META } from '../../data/questionnaire';
import type { Role } from '../../types/survey';

const ADMIN_AREA: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

export const AdminLogin: React.FC = () => {
  const { login, authStatus, currentUser } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ identifier?: string; password?: string }>({});
  const [error, setError] = useState('');

  if (authStatus === 'loading') return <SessionLoader />;
  if (authStatus === 'ready' && ADMIN_AREA.includes(currentUser.role) && !busy) {
    return <Navigate to={postLoginPath(location.search, 'admin', currentUser.role)} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const id = identifier.trim();
    const errs: typeof fieldErrors = {};
    if (!id) errs.identifier = 'Enter your email or mobile number.';
    else if (!id.includes('@') && !/^\d{10}$/.test(id.replace(/[\s-]/g, ''))) errs.identifier = 'Enter a valid email or 10-digit mobile number.';
    if (!password) errs.password = 'Enter your password.';
    setFieldErrors(errs);
    setError('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const user = await login(id.includes('@') ? id : id.replace(/[\s-]/g, ''), password, 'admin');
      navigate(postLoginPath(location.search, 'admin', user.role), { replace: true });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        if (err.code === 'WRONG_CONSOLE') setError(err.message || 'Volunteers sign in through the field app.');
        else if (err.isNetwork) setError('Cannot reach the server. Check your connection and try again.');
        else if (err.status === 401) setError(err.message && err.message !== 'Unauthorized' ? err.message : 'Incorrect email/mobile or password.');
        else setError(err.message);
      } else {
        setError('Sign-in failed. Please try again.');
      }
    }
  };

  const wrongConsole = error.toLowerCase().includes('field app');

  return (
    <div className="admin-shell min-h-screen flex flex-col lg:flex-row bg-[#FAF8F2]">
      {/* Brand panel */}
      <aside className="relative overflow-hidden lg:w-[44%] xl:w-[42%] bg-[#191712] text-white px-6 py-8 sm:px-10 lg:px-14 lg:py-12 flex flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 w-[340px] h-[340px] rounded-full bg-[#FDC513]/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 w-[280px] h-[280px] rounded-full bg-[#FDC513]/10 blur-3xl" />

        <div className="relative">
          <Miles2SmileLogo variant="light" />
        </div>

        <div className="relative mt-8 lg:mt-auto lg:mb-auto max-w-[460px]">
          <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#FDC513] text-[12.5px] font-bold text-[#181611]">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin &amp; Supervisor Console
          </span>
          <h1 className="mt-4 text-[28px] sm:text-[32px] lg:text-[36px] font-bold leading-[1.15] tracking-[-0.02em]">{STUDY_META.appName}</h1>
          <p className="mt-2 text-[15px] text-[#FDC513] font-medium">{STUDY_META.studyTitle}</p>
          <p className="mt-4 text-[14px] leading-relaxed text-white/70">
            A household survey of families evicted from the Lutumari Reserve Forest. Volunteers collect consented interviews and documents in
            the field; this console is where supervisors review submissions, verify documents and track progress across clusters.
          </p>

          <ul className="mt-6 hidden sm:grid grid-cols-3 gap-3 max-w-[420px]">
            {[
              ['Review', 'Approve or return surveys'],
              ['Verify', 'Check household documents'],
              ['Analyse', 'Live indicators & exports'],
            ].map(([t, d]) => (
              <li key={t} className="rounded-[12px] bg-white/[0.07] border border-white/10 px-3 py-2.5">
                <div className="text-[13.5px] font-semibold">{t}</div>
                <div className="text-[12px] text-white/65 leading-snug mt-0.5">{d}</div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-8 text-[12px] text-white/55">
          {STUDY_META.organization} · Data is confidential and every action is audited.
        </p>
      </aside>

      {/* Form */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)] p-6 sm:p-8">
            <h2 className="text-[22px] font-bold tracking-[-0.01em] text-[#181611]">Sign in</h2>
            <p className="mt-1 text-[14px] text-[#5C5547]">Use the email or mobile number on your M2S account.</p>

            {error && (
              <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-[10px] border border-[#F5C6C2] bg-[#FDF1F0] px-3.5 py-3 text-[13.5px] text-[#9B2C24]">
                <AlertCircle className="w-4 h-4 mt-[2px] shrink-0" />
                <div>
                  {error}
                  {wrongConsole && (
                    <Link to="/volunteer/login" className="mt-1 flex items-center gap-1 font-semibold text-[#8C6200] hover:text-[#6E4D00]">
                      Open the volunteer app <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={submit} noValidate className="mt-5 space-y-4">
              <div>
                <label htmlFor="login-id" className="block text-[12.5px] font-semibold text-[#181611] mb-1.5">
                  Email or mobile
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#726C5D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-id"
                    autoComplete="username"
                    autoFocus
                    value={identifier}
                    disabled={busy}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (fieldErrors.identifier) setFieldErrors((f) => ({ ...f, identifier: undefined }));
                    }}
                    placeholder="name@miles2smile.org or 98xxxxxxxx"
                    aria-invalid={!!fieldErrors.identifier || undefined}
                    className={`h-11 w-full rounded-[10px] border bg-white pl-9 pr-3 text-[14px] text-[#181611] placeholder:text-[#8E8675] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2] ${
                      fieldErrors.identifier ? 'border-[#E5A29C]' : 'border-[#E7E2D4]'
                    }`}
                  />
                </div>
                {fieldErrors.identifier && <p className="mt-1 text-[12px] text-[#C93B32]">{fieldErrors.identifier}</p>}
              </div>

              <div>
                <label htmlFor="login-pass" className="block text-[12.5px] font-semibold text-[#181611] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#726C5D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-pass"
                    type={showPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    disabled={busy}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
                    }}
                    aria-invalid={!!fieldErrors.password || undefined}
                    className={`h-11 w-full rounded-[10px] border bg-white pl-9 pr-11 text-[14px] text-[#181611] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2] ${
                      fieldErrors.password ? 'border-[#E5A29C]' : 'border-[#E7E2D4]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    aria-label={showPass ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md inline-flex items-center justify-center text-[#726C5D] hover:bg-[#EFECE2]"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {fieldErrors.password && <p className="mt-1 text-[12px] text-[#C93B32]">{fieldErrors.password}</p>}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="h-11 w-full rounded-[10px] bg-[#FDC513] hover:bg-[#E0AC00] text-[#181611] text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-colors border border-[#E0B500] disabled:opacity-70"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {busy ? 'Signing in…' : 'Sign in to console'}
              </button>
            </form>

            <div className="mt-5 rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] px-3.5 py-3 text-[12.5px] leading-relaxed text-[#524D40]">
              No account? Ask a project admin. The first admin is created with{' '}
              <code className="px-1 py-[1px] rounded bg-white border border-[#E7E2D4] text-[12px] text-[#181611]">npm run bootstrap-admin</code> on
              the server.
            </div>
          </div>

          <Link
            to="/volunteer/login"
            className="mt-4 flex items-center justify-center gap-2 h-11 rounded-[10px] border border-[#E7E2D4] bg-white text-[13.5px] font-semibold text-[#181611] hover:bg-[#FFF8D6]"
          >
            <Smartphone className="w-4 h-4 text-[#8C6200]" /> Volunteer? Open the field app
          </Link>
        </div>
      </main>
    </div>
  );
};

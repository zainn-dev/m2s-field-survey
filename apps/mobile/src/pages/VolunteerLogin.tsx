import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Lock, Phone, Wifi, WifiOff } from 'lucide-react';
import { LanguageToggle } from '@m2s/shared/components/LanguageToggle';
import { Miles2SmileLogo } from '@m2s/shared/components/Miles2SmileLogo';
import { useMobileStore } from '../store/mobileStore';

export const VolunteerLogin: React.FC = () => {
  const { authStatus, login, language, setLanguage, isOnline } = useMobileStore();
  const navigate = useNavigate();
  const hi = language === 'hi';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authStatus === 'ready') {
      navigate('/dashboard', { replace: true });
    }
  }, [authStatus, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError(hi ? 'मोबाइल/ईमेल और पासवर्ड दोनों दर्ज करें।' : 'Enter both mobile/email and password.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await login(identifier.trim(), password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#FAF8F2] flex flex-col max-w-[540px] mx-auto">
      <div className="bg-gradient-to-br from-[#FFE042] via-[#FDC513] to-[#ECC000] text-[#181611] px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-10 rounded-b-[28px] shadow-md border-b border-[#E5BC00]">
        <div className="flex items-center justify-between gap-3 mb-6">
          <Miles2SmileLogo variant="onGold" />
          <LanguageToggle language={language} onChange={setLanguage} compact />
        </div>

        <h1 className="text-[22px] font-extrabold tracking-tight text-[#181611]">
          {hi ? 'फील्ड वालंटियर लॉगिन' : 'Field Volunteer App'}
        </h1>
        <p className="text-[13px] text-[#363127] mt-1 font-medium">
          {hi
            ? 'घर-घर सर्वेक्षण, दस्तावेज़ कैप्चर और ऑफ़लाइन सिंक के लिए साइन इन करें।'
            : 'Sign in for household survey collection, camera capture, and offline sync.'}
        </p>

        <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#181611]/10 text-[#181611] text-[12px] font-semibold">
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 text-[#B42318]" />}
          <span>{isOnline ? (hi ? 'नेटवर्क उपलब्ध है' : 'Network available') : hi ? 'ऑफ़लाइन मोड' : 'Offline — network needed to sign in'}</span>
        </div>
      </div>

      <div className="px-4 -mt-5 pb-8 flex-1 space-y-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-[18px] border border-[#E7E2D4] p-5 shadow-[0_6px_24px_rgba(24,22,17,0.08)] space-y-4"
        >
          <div>
            <label htmlFor="vol-id" className="block text-[12.5px] font-semibold text-[#181611] mb-1.5">
              {hi ? 'मोबाइल नंबर या ईमेल' : 'Mobile Number or Email'}
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-[#726C5D] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="vol-id"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="9876543210 or name@miles2smile.org"
                className="w-full h-11 rounded-[10px] border border-[#DFD9C8] pl-10 pr-3 text-[14px] focus:outline-none focus:border-[#D9AE00] focus:ring-2 focus:ring-[#FDC513]/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="vol-pw" className="block text-[12.5px] font-semibold text-[#181611] mb-1.5">
              {hi ? 'पासवर्ड' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#726C5D] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="vol-pw"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full h-11 rounded-[10px] border border-[#DFD9C8] pl-10 pr-11 text-[14px] focus:outline-none focus:border-[#D9AE00] focus:ring-2 focus:ring-[#FDC513]/30"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center text-[#625C4E]"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-[10px] bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[12.5px] text-[#B42318]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-[12px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-60 text-[#181611] text-[15px] font-bold inline-flex items-center justify-center gap-2 border border-[#E0B500] shadow-sm transition"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? (hi ? 'साइन इन हो रहा है…' : 'Signing in…') : hi ? 'लॉगिन करें' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

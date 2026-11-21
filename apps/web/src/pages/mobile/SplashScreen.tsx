import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LayoutDashboard, ShieldCheck, Smartphone } from 'lucide-react';
import { Miles2SmileLogo } from '../../components/ui/Miles2SmileLogo';
import { useAppStore } from '../../store/appStore';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

export const SplashScreen: React.FC = () => {
  const navigate = useNavigate();
  const { authStatus, currentUser } = useAppStore();
  const signedIn = authStatus === 'ready' && !!currentUser.id;
  const canAdmin = signedIn && ADMIN_ROLES.includes(currentUser.role);

  const choices = [
    {
      key: 'volunteer',
      to: '/volunteer',
      icon: Smartphone,
      title: 'Field Volunteer App',
      detail: 'Record household surveys and documents, online or offline.',
      primary: true,
    },
    {
      key: 'admin',
      to: '/admin',
      icon: LayoutDashboard,
      title: 'Admin Console',
      detail: 'Review submissions, track cluster progress and manage the team.',
      primary: false,
    },
  ];

  return (
    <div className="admin-shell min-h-screen bg-[#FAF8F2] text-[#181611] flex flex-col">
      <div className="h-2 bg-[#FDC513]" />
      <main className="flex-1 flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[440px]">
          <div className="flex flex-col items-center text-center">
            <Miles2SmileLogo />
            <h1 className="mt-6 text-[24px] font-bold tracking-tight">M2S Field Survey</h1>
            <p className="mt-2 text-[14px] text-[#524D40] leading-relaxed max-w-[360px]">
              Lutumari Reserve Forest eviction study: household baseline and document collection, Nagaon, Assam.
            </p>
          </div>

          {signedIn && (
            <div className="mt-6 rounded-[10px] border border-[#EED77C] bg-[#FFF8D6] px-3.5 py-2.5 text-[13px] text-[#5C4100] text-center">
              Signed in as <strong className="font-semibold">{currentUser.name}</strong>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {choices.map((c) => {
              const Icon = c.icon;
              const muted = signedIn && c.key === 'admin' && !canAdmin;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => navigate(c.to)}
                  className={`group w-full text-left rounded-[14px] border p-4 flex items-center gap-4 transition shadow-[0_1px_2px_rgba(24,22,17,0.05)] ${
                    c.primary
                      ? 'bg-[#FDC513] border-[#E0AC00] text-[#181611] hover:bg-[#E5B00D]'
                      : 'bg-white border-[#E7E2D4] hover:border-[#D9AE00] hover:shadow-[0_6px_16px_-8px_rgba(24,22,17,0.18)]'
                  } ${muted ? 'opacity-70' : ''}`}
                >
                  <span
                    className={`w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0 ${
                      c.primary ? 'bg-[#181611] text-[#FDC513]' : 'bg-[#FFF8D6] text-[#8C6200]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold">{c.title}</span>
                    <span className={`block text-[12.5px] mt-0.5 ${c.primary ? 'text-[#181611]/80' : 'text-[#625C4E]'}`}>
                      {c.detail}
                    </span>
                  </span>
                  <ArrowRight
                    className={`w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                      c.primary ? 'text-[#181611]' : 'text-[#8C6200]'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-[12px] text-[#625C4E]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#8C6200]" />
            Miles2Smile Foundation. Data is stored privately and access is logged.
          </p>
        </div>
      </main>
    </div>
  );
};

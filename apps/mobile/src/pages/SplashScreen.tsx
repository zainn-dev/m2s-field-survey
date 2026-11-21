import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Miles2SmileLogo } from '@m2s/shared/components/Miles2SmileLogo';
import { useMobileStore } from '../store/mobileStore';

export const SplashScreen: React.FC = () => {
  const { authStatus } = useMobileStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (authStatus === 'ready') {
      navigate('/dashboard', { replace: true });
    } else if (authStatus === 'signedOut') {
      navigate('/login', { replace: true });
    }
  }, [authStatus, navigate]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-[#FFE047] via-[#FDC513] to-[#ECC000] text-[#181611] flex flex-col items-center justify-center px-6 text-center max-w-[540px] mx-auto">
      <div className="bg-white/90 backdrop-blur-sm border border-[#181611]/10 rounded-3xl px-8 py-9 space-y-4 shadow-2xl">
        <Miles2SmileLogo variant="dark" />
        <div className="space-y-1">
          <h1 className="text-[18px] font-extrabold tracking-tight text-[#181611]">M2S Field Survey</h1>
          <p className="text-[12.5px] text-[#524D40]">Volunteer Field Data & Document Collection</p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-2 text-[12px] text-[#625C4E] font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-[#181611]" />
          <span>Restoring offline workspace…</span>
        </div>
      </div>
    </div>
  );
};


/// <reference path="../assets/assets.d.ts" />
import React from 'react';
import adminLogo from '../assets/admin-logo.png';
import surveyLogo from '../assets/survey-logo.png';

export const ADMIN_LOGO_SRC = adminLogo;
export const VOLUNTEER_LOGO_SRC = surveyLogo;

interface Miles2SmileLogoProps {
  variant?: 'light' | 'dark' | 'onGold' | 'volunteer';
  compact?: boolean;
  showFoundation?: boolean;
}

export const Miles2SmileLogo: React.FC<Miles2SmileLogoProps> = ({
  variant = 'dark',
  compact = false,
}) => {
  if (variant === 'onGold' || variant === 'volunteer') {
    return (
      <img
        src={surveyLogo}
        alt="Miles 2 Smile — Gateway to Happiness"
        className={`${compact ? 'h-9 sm:h-10' : 'h-12 sm:h-14'} w-auto max-w-full object-contain select-none`}
      />
    );
  }

  return (
    <div className="inline-flex flex-col items-center select-none">
      <img
        src={adminLogo}
        alt="Miles 2 Smile — Gateway to Happiness"
        className={`${compact ? 'h-14 w-14' : 'h-[88px] w-[88px]'} rounded-full object-contain shadow-sm`}
      />
    </div>
  );
};

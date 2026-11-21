import React from 'react';
import { Languages } from 'lucide-react';
import { Language } from '../types/survey';

interface LanguageToggleProps {
  language: Language;
  onChange: (lang: Language) => void;
  compact?: boolean;
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({
  language,
  onChange,
  compact = false,
}) => {
  return (
    <div
      role="group"
      aria-label="Survey Language"
      className="inline-flex items-center bg-white/90 border border-[#DFD9C8] rounded-xl p-0.5"
    >
      {!compact && <Languages className="w-3.5 h-3.5 text-[#625C4E] ml-2 mr-1 hidden sm:block" />}
      <button
        type="button"
        onClick={() => onChange('en')}
        className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold transition ${
          language === 'en'
            ? 'bg-[#181611] text-[#FDC513] shadow-sm'
            : 'text-[#625C4E] hover:text-[#181611]'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => onChange('hi')}
        className={`min-h-[34px] px-2.5 rounded-lg text-xs font-semibold transition ${
          language === 'hi'
            ? 'bg-[#181611] text-[#FDC513] shadow-sm'
            : 'text-[#625C4E] hover:text-[#181611]'
        }`}
      >
        हिंदी
      </button>
    </div>
  );
};


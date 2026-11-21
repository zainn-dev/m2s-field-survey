import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  shortcutHint?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  className?: string;
  ariaLabel?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search by Survey ID, name or village...',
  shortcutHint,
  inputRef,
  className = '',
  ariaLabel = 'Search',
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="w-4 h-4 text-[#726C5D] absolute left-3 pointer-events-none" strokeWidth={2} />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full h-10 pl-9 pr-14 rounded-[10px] border border-[#E7E2D4] bg-white text-[13.5px] text-[#181611] placeholder:text-[#8E8675] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] transition [&::-webkit-search-cancel-button]:appearance-none"
      />
      <div className="absolute right-2 flex items-center gap-1.5">
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="p-1 rounded-md text-[#726C5D] hover:bg-[#EFECE2] hover:text-[#181611]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {shortcutHint && !value && (
          <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 text-[10.5px] font-semibold text-[#5C5547] bg-[#EFECE2] border border-[#E7E2D4] rounded-md">
            {shortcutHint}
          </kbd>
        )}
      </div>
    </div>
  );
};

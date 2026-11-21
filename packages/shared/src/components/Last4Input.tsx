import React, { useState } from 'react';

export const Last4Input: React.FC<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
}> = ({ id, value, onChange, disabled, required, label = 'Aadhaar: last 4 digits only' }) => {
  const [error, setError] = useState('');
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-[#181611] mb-1">
        {label} {required && <span className="text-[#C93B32]">*</span>}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          if (digits.length > 4) {
            setError('Enter only the last 4 digits. Full Aadhaar numbers are never recorded.');
            return;
          }
          setError('');
          onChange(digits);
        }}
        placeholder="e.g. 4821"
        aria-invalid={!!error}
        className="w-full h-11 rounded-[10px] border border-[#E7E2D4] bg-white px-3 text-[15px] font-mono tracking-widest focus:border-[#D9AE00] focus:outline-none disabled:bg-[#FAF8F2]"
      />
      {error && <p className="text-[12px] text-[#C93B32] mt-1">{error}</p>}
    </div>
  );
};


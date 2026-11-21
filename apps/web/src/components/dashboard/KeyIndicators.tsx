import React from 'react';
import { Panel } from './Panel';
import type { Indicator } from './types';

const SIZE = 72;
const STROKE = 7;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

const Ring: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#EFECE2" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[18px] font-bold text-[#181611] tabular-nums">
        {clamped}%
      </span>
    </div>
  );
};

export const KeyIndicators: React.FC<{ indicators: Indicator[]; onOpen?: () => void }> = ({ indicators, onOpen }) => (
  <Panel title="Key Indicators" titleNote="(from completed surveys)" bodyClassName="px-3 pb-3 flex items-center">
    <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-y-4">
      {indicators.map((ind) => (
        <button
          key={ind.label}
          type="button"
          onClick={onOpen}
          className="flex flex-col items-center text-center rounded-xl py-1 hover:bg-[#FAF8F2] transition-colors"
        >
          <Ring pct={ind.pct} color={ind.color} />
          <span className="mt-2.5 text-[13.5px] font-medium text-[#181611] leading-tight">{ind.label}</span>
          <span className="mt-0.5 text-[12.5px] text-[#5C5547]">({ind.range})</span>
        </button>
      ))}
    </div>
  </Panel>
);

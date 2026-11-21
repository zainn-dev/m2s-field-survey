import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Panel } from './Panel';
import type { TrendPoint } from './types';

const H = 142;
const PAD = { left: 34, right: 18, top: 10, bottom: 26 };

interface SurveyTrendProps {
  points: TrendPoint[];
}

export const SurveyTrend: React.FC<SurveyTrendProps> = ({ points }) => {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so axis text never scales down on narrower cards.
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(470);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length === 0]); // re-attach once the chart (not the empty state) renders

  const { maxY, ticks, coords } = useMemo(() => {
    const peak = Math.max(10, ...points.map((p) => p.count));
    const step = peak <= 50 ? 10 : Math.ceil(peak / 50) * 10;
    const max = Math.ceil((peak * 1.15) / step) * step;
    const yTicks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const c = points.map((p, i) => ({
      ...p,
      x: PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
      y: PAD.top + innerH - (p.count / max) * innerH,
    }));
    return { maxY: max, ticks: yTicks, coords: c };
  }, [points, W]);

  if (coords.length === 0) {
    return (
      <Panel title="Survey Trend" bodyClassName="px-4 pb-4 text-[13px] text-[#625C4E]">
        No completed surveys yet.
      </Panel>
    );
  }

  const baseY = H - PAD.bottom;
  const line = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1].x} ${baseY} L${coords[0].x} ${baseY}Z`;
  const activeIdx = hover ?? coords.length - 1;
  const active = coords[activeIdx];
  const colW = coords.length > 1 ? coords[1].x - coords[0].x : W;

  return (
    <Panel title="Survey Trend" bodyClassName="px-3 pb-2">
      <div ref={boxRef} className="relative select-none" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img" aria-label={`Cumulative completed surveys, ${coords[0].label} to ${coords[coords.length - 1].label}`}>
          <defs>
            <linearGradient id="m2s-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FDC513" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#FDC513" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {ticks.map((t) => {
            const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - t / maxY);
            return (
              <text key={t} x={PAD.left - 12} y={y + 4} textAnchor="end" fontSize="11" fill="#474235">
                {t}
              </text>
            );
          })}

          <path d={area} fill="url(#m2s-trend-fill)" />
          <path d={line} fill="none" stroke="#C99600" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />

          {coords.map((p, i) => (
            <g key={p.label}>
              <circle
                cx={p.x}
                cy={p.y}
                r={i === activeIdx ? 4.8 : 3.6}
                fill={i === activeIdx ? '#181611' : '#FDC513'}
                stroke={i === activeIdx ? '#FDC513' : '#9A6800'}
                strokeWidth={i === activeIdx ? 2 : 1.2}
              />
              <text x={p.x} y={H - 8} textAnchor="middle" fontSize="11" fill="#474235">
                {p.label}
              </text>
              {/* hover hit-area */}
              <rect
                x={p.x - colW / 2}
                y={0}
                width={colW}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </svg>

        {/* Tooltip */}
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${(active.x / W) * 100}%`,
            top: `${(active.y / H) * 100}%`,
            transform: `translate(${active.x / W > 0.75 ? '-100%' : '-50%'}, calc(-100% - 10px))`,
          }}
        >
          <div className="rounded-md bg-[#181611] px-2.5 py-1.5 text-[#FDC513] shadow-md whitespace-nowrap border border-[#FDC513]/40">
            <div className="text-[11.5px] leading-tight text-[#FDC513]">{active.label}</div>
            <div className="text-[13px] leading-tight font-medium">
              {active.count} Survey{active.count === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
};

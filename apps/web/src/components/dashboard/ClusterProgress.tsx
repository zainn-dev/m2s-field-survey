import React from 'react';
import { Panel } from './Panel';
import type { ClusterStat } from './types';

interface ClusterProgressProps {
  clusters: ClusterStat[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewAll: () => void;
}

export const ClusterProgress: React.FC<ClusterProgressProps> = ({ clusters, selectedId, onSelect, onViewAll }) => (
  <Panel title="Survey Progress by Cluster" onViewAll={onViewAll} bodyClassName="px-4 pb-3">
    <ul className="space-y-[2px]">
      {clusters.map((c) => {
        const active = selectedId === c.id;
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(active ? null : c.id)}
              aria-pressed={active}
              title={active ? 'Clear cluster filter' : `Filter dashboard by ${c.name}`}
              className={`w-full h-[28px] grid grid-cols-[minmax(76px,104px)_1fr_auto] items-center gap-3 sm:gap-4 rounded-lg px-1.5 -mx-1.5 text-left transition-colors ${
                active ? 'bg-[#FFF8D6]' : 'hover:bg-[#F7F4EA]'
              }`}
            >
              <span className="text-[14.5px] text-[#181611] truncate">{c.name}</span>
              <span className="h-[8px] rounded-full bg-[#EAE4D3] overflow-hidden">
                <span
                  className="block h-full rounded-full bg-[#FDC513] transition-[width] duration-500"
                  style={{ width: `${c.pct}%` }}
                />
              </span>
              <span className="text-[13.5px] text-[#363127] tabular-nums whitespace-nowrap">
                <span className="inline-block min-w-[52px] text-right">
                  {c.done} / {c.targetHouseholds}
                </span>
                <span className="inline-block min-w-[50px] text-right text-[#625C4E]">({c.pct}%)</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </Panel>
);

import React, { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Panel } from './Panel';
import type { ClusterCoverage, ClusterStat } from './types';
import type { SurveyRecord, SurveyStatus, UserAccount } from '../../types/survey';

const PIN_COLOR: Record<ClusterCoverage, string> = {
  completed: '#D4A100',
  pending: '#D97706',
  empty: '#9C9482',
};

interface CoverageMapProps {
  clusters: ClusterStat[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  surveys?: SurveyRecord[];
  onSelectSurvey?: (survey: SurveyRecord) => void;
  users?: UserAccount[];
}

const HOUSEHOLD_PIN_COLOR: Record<SurveyStatus, string> = {
  APPROVED: '#FDC513',
  SUBMITTED: '#2563EB',
  DRAFT: '#6B7280',
  PENDING_SYNC: '#7C3AED',
  RETURNED: '#D97706',
  REJECTED: '#C93B32',
};

function projectGeoPin(
  lat: number,
  lng: number,
  fallbackClusterId: string | undefined,
  clusterMap: Map<string, ClusterStat>
): { x: number; y: number } {
  // Lutumari / Nagaon Reserve Forest bounding box
  const inStudyBounds = lat >= 26.2 && lat <= 26.45 && lng >= 92.55 && lng <= 92.88;
  if (inStudyBounds) {
    const x = ((lng - 92.55) / (92.88 - 92.55)) * 84 + 8;
    const y = (1 - (lat - 26.2) / (26.45 - 26.2)) * 78 + 11;
    return { x: Math.max(6, Math.min(94, x)), y: Math.max(8, Math.min(92, y)) };
  }
  const c = fallbackClusterId ? clusterMap.get(fallbackClusterId) : undefined;
  const cx = c?.mapX ?? 50;
  const cy = c?.mapY ?? 50;
  const dx = Math.sin(lat * 137.5) * 6;
  const dy = Math.cos(lng * 137.5) * 6;
  return { x: Math.max(6, Math.min(94, cx + dx)), y: Math.max(8, Math.min(92, cy + dy)) };
}

/** Stylised terrain of the Lutumari Reserve Forest area (not to scale). */
const Terrain: React.FC = () => (
  <svg viewBox="0 0 470 210" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full" aria-hidden="true">
    <defs>
      <filter id="m2s-soft" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="2.2" />
      </filter>
      <pattern id="m2s-canopy" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.1" fill="#C9BC94" opacity="0.5" />
        <circle cx="5.5" cy="5" r="0.9" fill="#C9BC94" opacity="0.38" />
      </pattern>
    </defs>

    <rect width="470" height="210" fill="#F2EDE0" />

    {/* Open ground */}
    <g filter="url(#m2s-soft)" opacity="0.9">
      <path d="M0 0H140Q120 30 70 38T0 60Z" fill="#F7F4EA" />
      <path d="M330 170Q380 150 470 160V210H300Q300 185 330 170Z" fill="#F6F2E6" />
      <path d="M395 0H470V70Q440 60 420 30Z" fill="#F5F1E4" />
    </g>

    {/* Contours */}
    <g filter="url(#m2s-soft)">
      <path d="M60 40Q120 10 200 30T330 26Q390 40 420 80T400 150Q350 190 270 185T130 178Q70 165 50 120T60 40Z" fill="#E8DFC5" />
      <path d="M95 60Q150 40 210 58T300 55Q350 70 360 105T320 160Q260 175 200 160T110 140Q80 110 95 60Z" fill="#E0D4B2" />
      <path d="M150 85Q190 70 230 90T290 100Q300 130 260 140T180 130Q140 115 150 85Z" fill="#D6C8A0" />
      <path d="M8 120Q30 105 55 125T50 175Q25 185 10 165Z" fill="#E5DCBE" />
      <path d="M410 95Q445 90 460 115T440 150Q415 150 405 125Z" fill="#E4DBBD" />
    </g>
    <path d="M60 40Q120 10 200 30T330 26Q390 40 420 80T400 150Q350 190 270 185T130 178Q70 165 50 120T60 40Z" fill="url(#m2s-canopy)" />

    {/* Rivers */}
    <path d="M-5 150Q60 138 110 152T205 150Q260 140 300 160T380 150Q430 140 475 158" fill="none" stroke="#93C6DF" strokeWidth="3.4" strokeLinecap="round" />
    <path d="M205 150Q215 120 245 108T275 70" fill="none" stroke="#A9D3E7" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M380 150Q385 120 410 100T430 60" fill="none" stroke="#A9D3E7" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M110 152Q100 175 80 190" fill="none" stroke="#A9D3E7" strokeWidth="1.3" strokeLinecap="round" />

    {/* Roads & tracks */}
    <path d="M0 78Q70 70 130 84T260 78Q330 72 470 92" fill="none" stroke="#FAF8F0" strokeWidth="2" opacity="0.95" />
    <path d="M168 0Q160 60 178 110T160 210" fill="none" stroke="#FAF8F0" strokeWidth="1.6" opacity="0.9" />
    <path d="M318 0Q300 60 322 120T300 210" fill="none" stroke="#FAF8F0" strokeWidth="1.3" opacity="0.8" strokeDasharray="5 3" />

    {/* Reserve forest boundary */}
    <path
      d="M48 52L78 40L96 46L120 30L150 36L178 24L204 34L236 22L262 30L290 20L318 30L348 26L372 44L396 52L414 78L408 100L424 122L406 146L380 156L360 176L330 172L300 186L270 178L238 190L208 178L176 186L148 172L120 176L96 160L70 158L56 136L40 120L50 98L38 76Z"
      fill="rgba(180,140,20,0.06)"
      stroke="#6B624D"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

export const CoverageMap: React.FC<CoverageMapProps> = ({
  clusters,
  selectedId,
  onSelect,
  surveys = [],
  onSelectSurvey,
  users = [],
}) => {
  const [zoom, setZoom] = useState(1);
  const [statusFilter, setStatusFilter] = useState<SurveyStatus | 'ALL'>('ALL');
  const [showHouseholds, setShowHouseholds] = useState(true);

  const clusterMap = useMemo(() => new Map(clusters.map((c) => [c.id, c])), [clusters]);
  const gpsHouseholds = useMemo(() => {
    return surveys.filter(
      (s) =>
        Boolean(s.gpsConsent) &&
        s.gpsLat != null &&
        s.gpsLng != null &&
        (!selectedId || s.clusterId === selectedId) &&
        (statusFilter === 'ALL' || s.status === statusFilter)
    );
  }, [surveys, selectedId, statusFilter]);

  const gpsVolunteers = useMemo(
    () =>
      users.filter(
        (u) =>
          (u.role === 'VOLUNTEER' || u.lastGpsLat != null) &&
          u.lastGpsLat != null &&
          u.lastGpsLng != null &&
          (!selectedId || u.assignedClusterIds.includes(selectedId))
      ),
    [users, selectedId]
  );

  return (
    <Panel
      title="Household Coverage (Map)"
      titleNote={surveys.length ? `(${gpsHouseholds.length} GPS pins)` : undefined}
      headerExtra={
        surveys.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Filter map by survey status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SurveyStatus | 'ALL')}
              className="h-7 rounded-md border border-[#DFD9C8] bg-white px-2 text-[11.5px] font-medium text-[#181611]"
            >
              <option value="ALL">All statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="DRAFT">Draft</option>
              <option value="RETURNED">Returned</option>
            </select>
            <button
              type="button"
              onClick={() => setShowHouseholds((v) => !v)}
              className={`h-7 rounded-md border px-2 text-[11.5px] font-medium ${
                showHouseholds
                  ? 'border-[#E0AC00] bg-[#FFF8D6] text-[#6E4D00]'
                  : 'border-[#DFD9C8] bg-white text-[#625C4E]'
              }`}
            >
              {showHouseholds ? 'GPS On' : 'GPS Off'}
            </button>
          </div>
        ) : undefined
      }
      bodyClassName="px-4 pb-3 flex flex-col"
    >
      <div className="relative h-[196px] rounded-[10px] border border-[#DFD9C8] overflow-hidden bg-[#F2EDE0]">
        <div className="absolute inset-0 origin-center transition-transform duration-300" style={{ transform: `scale(${zoom})` }}>
          <Terrain />

          {showHouseholds &&
            gpsHouseholds.map((s) => {
              const pos = projectGeoPin(s.gpsLat ?? 0, s.gpsLng ?? 0, s.clusterId, clusterMap);
              const color = HOUSEHOLD_PIN_COLOR[s.status];
              return (
                <button
                  key={`hh-${s.id}`}
                  type="button"
                  onClick={() => onSelectSurvey?.(s)}
                  title={`${s.surveyCode || 'Draft'} · ${s.profile.headName || 'Household'} (${s.status}) · GPS ±${Math.round(
                    s.gpsAccuracyMeters ?? 0
                  )}m`}
                  aria-label={`Household ${s.surveyCode || s.id} GPS marker`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, background: color }}
                  className="absolute z-[15] -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] hover:scale-125 transition-transform"
                />
              );
            })}

          {gpsVolunteers.map((v) => {
            const pos = projectGeoPin(v.lastGpsLat ?? 0, v.lastGpsLng ?? 0, v.assignedClusterIds[0], clusterMap);
            return (
              <span
                key={`vol-${v.id}`}
                title={`${v.name} · ${v.lastLocationLabel || 'Active volunteer'}${v.lastIp ? ` · IP ${v.lastIp}` : ''}`}
                aria-label={`Volunteer ${v.name} live location`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                className="absolute z-[18] -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#217045] border-2 border-white ring-2 ring-[#217045]/30 shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
              />
            );
          })}

          {clusters.map((c) => {
            const active = selectedId === c.id;
            const flip = c.mapX > 80; // keep labels inside the map near the right edge
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(active ? null : c.id)}
                aria-pressed={active}
                aria-label={`${c.name}: ${c.done} completed`}
                style={{ left: `${c.mapX}%`, top: `${c.mapY}%` }}
                className={`absolute flex items-start gap-1 -translate-y-[26px] ${flip ? 'flex-row-reverse -translate-x-[calc(100%-11px)]' : '-translate-x-[11px]'} ${active ? 'z-20' : 'z-10'} group`}
              >
                <svg width="22" height="28" viewBox="0 0 24 30" className="shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)] transition-transform group-hover:-translate-y-0.5">
                  <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.4 12 30 12 30s12-9.6 12-18.1C24 5.3 18.6 0 12 0Z" fill={PIN_COLOR[c.coverage]} />
                  <circle cx="12" cy="11.6" r="4.4" fill="#fff" />
                </svg>
                <span
                  className={`mt-[-2px] rounded-md bg-white/95 px-1.5 py-[3px] text-left leading-[1.15] shadow-[0_1px_3px_rgba(24,22,17,0.18)] ${
                    active ? 'ring-2 ring-[#FDC513]' : ''
                  }`}
                >
                  <span className="block text-[12px] font-semibold text-[#181611] whitespace-nowrap">{c.name}</span>
                  <span className="block text-[11px] text-[#524D40]">({c.done})</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Zoom controls */}
        <div className="absolute top-2.5 left-2.5 z-30 flex flex-col rounded-md bg-white shadow-[0_1px_3px_rgba(24,22,17,0.2)] overflow-hidden">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.2).toFixed(1)))}
            className="w-[26px] h-[26px] flex items-center justify-center hover:bg-[#FAF8F2] border-b border-[#E7E2D4]"
          >
            <Plus className="w-4 h-4 text-[#181611]" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(1)))}
            className="w-[26px] h-[26px] flex items-center justify-center hover:bg-[#FAF8F2]"
          >
            <Minus className="w-4 h-4 text-[#181611]" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-2.5 px-1 text-[12px] text-[#363127]">
        <LegendDot color="#FDC513" label="Completed" />
        <LegendDot color="#D97706" label="Pending" />
        <LegendDot color="#9C9482" label="Not Started" />
        {surveys.length > 0 && <LegendDot color="#2563EB" label={`Consented GPS (${gpsHouseholds.length})`} />}
        {gpsVolunteers.length > 0 && <LegendDot color="#217045" label={`Volunteers (${gpsVolunteers.length})`} />}
      </div>
    </Panel>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-[11px] h-[11px] rounded-full" style={{ background: color }} />
    {label}
  </span>
);

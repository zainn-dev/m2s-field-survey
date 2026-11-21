import React, { useMemo, useState } from 'react';
import { ExternalLink, Globe, MapPin, Navigation, Radio } from 'lucide-react';
import { googleMapsUrl } from '@m2s/shared/utils/gpsCapture';
import type { SurveyRecord, UserAccount } from '../../types/survey';
import { Panel } from './Panel';
import { relativeTime } from './format';

type LocationTab = 'TEAM' | 'SURVEYS';

interface VolunteerLocationsPanelProps {
  users: UserAccount[];
  surveys: SurveyRecord[];
  onOpenSurvey: (survey: SurveyRecord) => void;
  onViewAllVolunteers?: () => void;
}

function isRecentlyActive(ts?: string): boolean {
  if (!ts) return false;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) && Date.now() - ms < 15 * 60_000;
}

export const VolunteerLocationsPanel: React.FC<VolunteerLocationsPanelProps> = ({
  users,
  surveys,
  onOpenSurvey,
  onViewAllVolunteers,
}) => {
  const [tab, setTab] = useState<LocationTab>('TEAM');

  const volunteers = useMemo(() => {
    const latestSurveyByVol = new Map<string, SurveyRecord>();
    for (const s of surveys) {
      const existing = latestSurveyByVol.get(s.volunteerId);
      if (!existing || s.updatedAt > existing.updatedAt) {
        latestSurveyByVol.set(s.volunteerId, s);
      }
    }

    return users
      .filter((u) => u.role === 'VOLUNTEER' || u.lastIp || u.lastGpsLat != null)
      .sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || ''))
      .map((u) => ({
        user: u,
        live: isRecentlyActive(u.lastActive),
        latestSurvey: latestSurveyByVol.get(u.id),
      }));
  }, [users, surveys]);

  const locatedSurveys = useMemo(
    () =>
      [...surveys]
        .filter((s) => s.gpsLat != null || !!s.submittedIp || !!s.submittedIpLocation)
        .sort((a, b) => (b.submittedAt || b.updatedAt).localeCompare(a.submittedAt || a.updatedAt))
        .slice(0, 12),
    [surveys]
  );

  const tabs: { id: LocationTab; label: string }[] = [
    { id: 'TEAM', label: `Volunteers (${volunteers.length})` },
    { id: 'SURVEYS', label: `Survey Check-ins (${locatedSurveys.length})` },
  ];

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#217045]" />
          Live Field Locations &amp; IP Telemetry
        </span>
      }
      titleNote="Automatic GPS & network origin from volunteer check-ins"
      onViewAll={onViewAllVolunteers}
      viewAllLabel="All Volunteers"
      headerExtra={
        <div className="inline-flex items-center gap-1 rounded-lg bg-[#FAF8F2] border border-[#E7E2D4] p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition ${
                tab === t.id ? 'bg-[#FDC513] text-[#181611]' : 'text-[#5C5547] hover:text-[#181611]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'TEAM' ? (
        volunteers.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-[#726C5D]">
            No volunteer location or IP telemetry recorded yet. Telemetry appears automatically as soon as volunteers sign in or conduct surveys.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="border-y border-[#E7E2D4] bg-[#FAF8F2] text-[11px] uppercase tracking-wide text-[#5C5547]">
                  <th className="py-2.5 px-4 font-semibold">Volunteer</th>
                  <th className="py-2.5 px-3 font-semibold">Current Area / Location</th>
                  <th className="py-2.5 px-3 font-semibold">GPS Coordinates</th>
                  <th className="py-2.5 px-3 font-semibold">Network IP &amp; Region</th>
                  <th className="py-2.5 px-3 font-semibold">Latest Survey</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE2]">
                {volunteers.map(({ user: u, live, latestSurvey }) => (
                  <tr key={u.id} className="hover:bg-[#FAF8F2]/70 transition">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${live ? 'bg-[#217045]' : 'bg-[#B5AE9C]'}`}
                          title={live ? 'Active in last 15 minutes' : 'Offline / idle'}
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-[#181611] truncate">{u.name}</div>
                          <div className="text-[11.5px] text-[#726C5D] truncate">{u.mobile || u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5 text-[#181611] font-medium">
                        <MapPin className="w-3.5 h-3.5 text-[#8C6200] shrink-0" />
                        {u.lastLocationLabel || latestSurvey?.clusterName || 'Awaiting location'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {u.lastGpsLat != null && u.lastGpsLng != null ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[12px] text-[#217045] font-medium">
                            {u.lastGpsLat.toFixed(5)}, {u.lastGpsLng.toFixed(5)}
                          </span>
                          {u.lastGpsAccuracy != null && (
                            <span className="text-[11px] text-[#726C5D]">(±{Math.round(u.lastGpsAccuracy)}m)</span>
                          )}
                          <a
                            href={googleMapsUrl(u.lastGpsLat, u.lastGpsLng)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#8C6200] hover:underline"
                          >
                            Map <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#8E8675]">No GPS fix yet</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {u.lastIp ? (
                        <div>
                          <span className="inline-flex items-center gap-1 font-mono text-[12px] bg-[#FAF8F2] border border-[#E7E2D4] px-1.5 py-0.5 rounded text-[#181611]">
                            <Globe className="w-3 h-3 text-[#726C5D]" />
                            {u.lastIp}
                          </span>
                          {u.lastIpLocation && <div className="text-[11.5px] text-[#5C5547] mt-0.5">{u.lastIpLocation}</div>}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#8E8675]">Not captured</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {latestSurvey ? (
                        <button
                          type="button"
                          onClick={() => onOpenSurvey(latestSurvey)}
                          className="text-left group"
                        >
                          <span className="font-mono text-[12px] font-semibold text-[#8C6200] group-hover:underline">
                            {latestSurvey.surveyCode || latestSurvey.id.slice(0, 8)}
                          </span>
                          <div className="text-[11.5px] text-[#5C5547] truncate max-w-[170px]">
                            {latestSurvey.profile.headName || 'Unnamed'} · {latestSurvey.clusterName}
                          </div>
                        </button>
                      ) : (
                        <span className="text-[12px] text-[#8E8675]">No surveys</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right text-[12px] text-[#5C5547] whitespace-nowrap">
                      {u.lastActive ? relativeTime(u.lastActive) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : locatedSurveys.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-[#726C5D]">
          No survey location or IP logs available yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-[#E7E2D4] bg-[#FAF8F2] text-[11px] uppercase tracking-wide text-[#5C5547]">
                <th className="py-2.5 px-4 font-semibold">Survey &amp; Household</th>
                <th className="py-2.5 px-3 font-semibold">Volunteer</th>
                <th className="py-2.5 px-3 font-semibold">Cluster</th>
                <th className="py-2.5 px-3 font-semibold">Survey GPS</th>
                <th className="py-2.5 px-3 font-semibold">Submitted IP &amp; Area</th>
                <th className="py-2.5 px-4 font-semibold text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFECE2]">
              {locatedSurveys.map((s) => (
                <tr key={s.id} className="hover:bg-[#FAF8F2]/70 transition">
                  <td className="py-2.5 px-4">
                    <button type="button" onClick={() => onOpenSurvey(s)} className="text-left group">
                      <div className="font-mono text-[12px] font-semibold text-[#8C6200] group-hover:underline">
                        {s.surveyCode || s.id.slice(0, 8)}
                      </div>
                      <div className="text-[12px] text-[#181611] truncate max-w-[180px]">
                        {s.profile.headName || 'Unnamed Household'}
                      </div>
                    </button>
                  </td>
                  <td className="py-2.5 px-3 text-[#181611] font-medium">{s.volunteerName || 'Unknown'}</td>
                  <td className="py-2.5 px-3 text-[#5C5547]">{s.clusterName || '—'}</td>
                  <td className="py-2.5 px-3">
                    {s.gpsLat != null && s.gpsLng != null ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 font-mono text-[12px] text-[#217045]">
                          <Navigation className="w-3 h-3" />
                          {s.gpsLat.toFixed(5)}, {s.gpsLng.toFixed(5)}
                        </span>
                        <a
                          href={googleMapsUrl(s.gpsLat, s.gpsLng)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[#8C6200] hover:underline"
                        >
                          Map <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : s.gpsConsent === false ? (
                      <span className="text-[12px] text-[#8E8675]">Opted out</span>
                    ) : (
                      <span className="text-[12px] text-[#8E8675]">Pending lock</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {s.submittedIp ? (
                      <div>
                        <span className="font-mono text-[12px] bg-[#FAF8F2] border border-[#E7E2D4] px-1.5 py-0.5 rounded text-[#181611]">
                          {s.submittedIp}
                        </span>
                        {s.submittedIpLocation && (
                          <div className="text-[11.5px] text-[#5C5547] mt-0.5">{s.submittedIpLocation}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#8E8675]">Not captured</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right text-[12px] text-[#5C5547] whitespace-nowrap">
                    {relativeTime(s.submittedAt || s.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};


import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { googleMapsUrl, describeStudyArea } from '@m2s/shared/utils/gpsCapture';
import {
  initialSurveyGpsFields,
  mergeSurveyGpsReading,
  readCachedDeviceGps,
  writeCachedDeviceGps,
} from '@m2s/shared/utils/sessionLocation';
import type { SurveyRecord } from '../src/types/survey';

describe('Automatic GPS telemetry & transparent logo helpers', () => {
  const store = new Map<string, string>();
  const origLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        clear: () => store.clear(),
      },
    });
  });

  afterEach(() => {
    if (origLocalStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: origLocalStorage });
    }
  });

  it('prefills new survey drafts with automatic GPS consent and fresh cached device coordinates', () => {
    const emptyDraftGps = initialSurveyGpsFields();
    expect(emptyDraftGps.gpsConsent).toBe(true);
    expect(emptyDraftGps.gpsLat).toBeUndefined();

    writeCachedDeviceGps({
      lat: 26.2512,
      lng: 92.7123,
      accuracyMeters: 11,
      capturedAt: new Date().toISOString(),
      permissionStatus: 'granted',
      locationLabel: 'Lutumari / Nagaon Study Area',
    });

    const cached = readCachedDeviceGps();
    expect(cached).not.toBeNull();
    expect(cached?.lat).toBeCloseTo(26.2512);

    const prefilled = initialSurveyGpsFields();
    expect(prefilled.gpsConsent).toBe(true);
    expect(prefilled.gpsLat).toBeCloseTo(26.2512);
    expect(prefilled.gpsLng).toBeCloseTo(92.7123);
    expect(prefilled.gpsPermissionStatus).toBe('granted');
  });

  it('merges live GPS readings onto open surveys without overriding respondent opt-outs', () => {
    const reading = {
      lat: 26.261,
      lng: 92.721,
      accuracyMeters: 8,
      capturedAt: '2026-11-12T05:45:00.000Z',
      permissionStatus: 'granted' as const,
      locationLabel: 'Lutumari / Nagaon Study Area',
    };

    const openSurvey = {
      id: 's1',
      householdId: 'h1',
      volunteerId: 'v1',
      clusterId: 'c1',
      clusterName: 'Kandapara',
      status: 'DRAFT',
      revision: 0,
      consentGiven: false,
      gpsConsent: true,
      profile: { surveyCode: '', date: '', clusterId: 'c1', clusterName: 'Kandapara', interviewerName: '', headName: '', respondentName: '', relationToHead: '', contactPhone: '', familySize: 1, adults: 1, children: 0, docVerifiedCode: '', idLast4: '', religion: '', motherTongue: '' },
      answers: {},
      reviews: [],
      createdAt: '2026-11-12T05:00:00.000Z',
      updatedAt: '2026-11-12T05:00:00.000Z',
    } as SurveyRecord;

    const merged = mergeSurveyGpsReading(openSurvey, reading);
    expect(merged.gpsLat).toBeCloseTo(26.261);
    expect(merged.gpsLng).toBeCloseTo(92.721);

    const optedOut = mergeSurveyGpsReading({ ...openSurvey, gpsConsent: false }, reading);
    expect(optedOut.gpsLat).toBeUndefined();
    expect(optedOut.gpsConsent).toBe(false);
  });

  it('builds Google Maps links, describes study zones cleanly, and keeps transparent PNG logo', () => {
    expect(googleMapsUrl(26.261, 92.721)).toBe('https://maps.google.com/?q=26.261000,92.721000');
    expect(describeStudyArea(26.261, 92.721)).toBe('Lutumari / Nagaon Study Area');

    const logoSrc = readFileSync(resolve(process.cwd(), '..', '..', 'packages', 'shared', 'src', 'components', 'Miles2SmileLogo.tsx'), 'utf8');
    expect(logoSrc).toContain('survey-logo.png');
    expect(logoSrc).not.toContain('bg-[#191712]');
  });
});


import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuditEvent,
  BootstrapPayload,
  ClusterItem,
  DocumentCategoryConfig,
  HouseholdDocument,
  Language,
  NewUserInput,
  NotificationItem,
  QualityIssue,
  QualityPolicyConfig,
  ReviewDecision,
  StudySettings,
  SurveyRecord,
  UserAccount,
} from '../types/survey';
import { api, ApiError, downloadFile, setUnauthorizedHandler, uploadWithProgress } from '../api/http';
import { prepareDocumentFile } from '@m2s/shared/utils/fileCapture';
import {
  clearCachedDeviceGps,
  dispatchSessionLocationPing,
  initialSurveyGpsFields,
  readCachedDeviceGps,
  type CachedDeviceGps,
  type SessionGpsState,
} from '@m2s/shared/utils/sessionLocation';
import {
  buildOptimisticQualityRecords,
  DEFAULT_QUALITY_POLICY,
  defaultQualityService,
  mergeQueuedQualityEvents,
  type OfflineQualityAction,
} from '@m2s/shared/validation';
import { clearOfflineData, db, QueuedQualityEvent, QueuedSurvey, QueuedUpload } from '../db';
import { createEmptyProfile, STUDY_META } from '../data/questionnaire';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export type AuthStatus = 'loading' | 'signedOut' | 'ready';
export type ExportKind = 'surveys.csv' | 'answers.csv' | 'documents.zip';

export interface UploadInput {
  householdId: string;
  categoryId: string;
  docType?: string;
  aadhaarLast4?: string;
  files: File[];
}

export interface SyncState {
  running: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface AppContextValue {
  /* session */
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  /** Signed-in user (a blank placeholder while signed out — guard routes with RequireAuth). */
  currentUser: UserAccount;
  login: (identifier: string, password: string, app: 'admin' | 'volunteer') => Promise<UserAccount>;
  /** Returns false (and does nothing) if unsynced work exists and force is not set. */
  logout: (opts?: { force?: boolean }) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** True when the data on screen came from the on-device snapshot (no server contact yet). */
  usingOfflineSnapshot: boolean;

  /* connectivity */
  isOnline: boolean;
  simulatedOffline: boolean;
  setSimulatedOffline: (offline: boolean) => void;

  /* preferences */
  language: Language;
  setLanguage: (lang: Language) => void;

  /* data */
  users: UserAccount[];
  clusters: ClusterItem[];
  surveys: SurveyRecord[];
  documents: HouseholdDocument[];
  docCategories: DocumentCategoryConfig[];
  study: StudySettings;
  qualityPolicy: QualityPolicyConfig;
  qualityRules: NonNullable<BootstrapPayload['qualityRules']>;
  auditLogs: AuditEvent[];
  notifications: NotificationItem[];

  /* toasts */
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  notify: (text: string, type?: 'success' | 'error' | 'info') => void;

  /* surveys */
  /** A new local draft (not saved until saveSurvey). revision 0, surveyCode '' until the server allocates one. */
  newSurveyDraft: () => SurveyRecord;
  /** Saves (create or update). Offline / unreachable → queued on device and returned with the queued status. */
  saveSurvey: (record: SurveyRecord) => Promise<SurveyRecord>;
  submitSurvey: (record: SurveyRecord) => Promise<SurveyRecord>;
  recordQualityAction: (
    survey: SurveyRecord,
    issue: QualityIssue,
    action: OfflineQualityAction,
    note?: string
  ) => Promise<SurveyRecord>;
  overrideQualityIssues: (surveyId: string, ruleIds: string[], reason: string) => Promise<SurveyRecord>;
  deleteSurvey: (surveyId: string) => Promise<void>;
  reviewSurvey: (surveyId: string, decision: ReviewDecision, reason: string) => Promise<SurveyRecord>;

  /* documents */
  uploadDocument: (input: UploadInput, onProgress?: (pct: number) => void) => Promise<HouseholdDocument>;
  removeDocument: (docId: string) => Promise<void>;
  verifyDocument: (docId: string) => Promise<void>;
  rejectDocument: (docId: string, reason: string) => Promise<void>;
  /** Image/stream URL for a page. mode 'view' writes a "viewed" audit entry; 'download' forces an attachment. */
  documentPageUrl: (doc: HouseholdDocument, pageIndex?: number, mode?: 'inline' | 'view' | 'download') => string;
  downloadDocument: (doc: HouseholdDocument, pageIndex?: number) => Promise<void>;

  /* offline queue */
  pendingSurveys: QueuedSurvey[];
  pendingUploads: QueuedUpload[];
  pendingQualityEvents: QueuedQualityEvent[];
  pendingCount: number;
  isPendingSync: (surveyId: string) => boolean;
  syncState: SyncState;
  syncPendingSurveys: () => Promise<number>;
  resolveConflict: (surveyId: string, keep: 'mine' | 'server') => Promise<void>;
  discardQueued: (id: string) => Promise<void>;

  /* exports */
  downloadExport: (kind: ExportKind, params?: Record<string, string | undefined>) => Promise<void>;

  /* administration */
  createUser: (input: NewUserInput) => Promise<UserAccount>;
  updateUser: (userId: string, patch: Partial<Omit<UserAccount, 'id' | 'lastActive' | 'active'>>) => Promise<UserAccount>;
  setUserActive: (userId: string, active: boolean) => Promise<void>;
  resetUserPassword: (userId: string, password: string) => Promise<void>;
  createCluster: (cluster: Omit<ClusterItem, 'id'> & { id?: string }) => Promise<ClusterItem>;
  updateCluster: (clusterId: string, patch: Partial<Omit<ClusterItem, 'id'>>) => Promise<ClusterItem>;
  updateDocCategories: (cats: DocumentCategoryConfig[]) => Promise<void>;
  updateStudySettings: (s: StudySettings) => Promise<void>;
  updateQualityPolicy: (p: QualityPolicyConfig) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  /** Records a client-side event (action must start with export_, print_ or view_). Fire and forget. */
  logAudit: (action: string, entity: string, entityId: string, summary: string) => void;
  deviceGps: CachedDeviceGps | null;
  gpsState: SessionGpsState;
  refreshLocationPing: (force?: boolean) => Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const GUEST: UserAccount = {
  id: '',
  name: '',
  email: '',
  mobile: '',
  role: 'VOLUNTEER',
  assignedClusterIds: [],
  active: false,
  lastActive: '',
};
const DEFAULT_STUDY: StudySettings = { targetSample: STUDY_META.targetSample, allowVolunteerDelete: true, requireDocumentsForSubmission: false };
const LANG_KEY = 'm2s_lang';
const SNAPSHOT_KEY = 'bootstrap';
const RULES_CACHE_KEY = 'quality_rules_v1';
const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
const backoff = (attempts: number) => Date.now() + Math.min(2 ** attempts * 2000, 5 * 60_000);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

function upsertById<T extends { id: string }>(list: T[], item: T, prepend = true): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return prepend ? [item, ...list] : [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

function surveyPayload(
  record: SurveyRecord,
  baseRevision: number,
  idempotencyKey: string,
  submit: boolean,
  qualityEvents?: QueuedQualityEvent[]
) {
  return {
    idempotencyKey,
    baseRevision,
    submit,
    consentGiven: record.consentGiven,
    gpsConsent: Boolean(record.gpsConsent),
    gpsLat: record.gpsConsent ? record.gpsLat : undefined,
    gpsLng: record.gpsConsent ? record.gpsLng : undefined,
    gpsAccuracyMeters: record.gpsConsent ? record.gpsAccuracyMeters : undefined,
    gpsCapturedAt: record.gpsConsent ? record.gpsCapturedAt : undefined,
    gpsPermissionStatus: record.gpsPermissionStatus,
    startedAt: record.startedAt,
    durationSec: record.durationSec,
    profile: record.profile,
    answers: Object.values(record.answers)
      .filter((a) => a.optionKeys.length > 0 || (a.otherText ?? '').trim().length > 0)
      .map((a) => ({ questionId: a.questionId, optionKeys: a.optionKeys, otherText: a.otherText || undefined })),
    ...(qualityEvents?.length
      ? {
          qualityEvents: qualityEvents.map((ev) => ({
            ruleId: ev.ruleId,
            action: ev.action,
            note: ev.note,
            clientEventId: ev.id,
          })),
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [usingOfflineSnapshot, setUsingOfflineSnapshot] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en';
    } catch {
      return 'en';
    }
  });
  const [browserOnline, setBrowserOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [queue, setQueue] = useState<QueuedSurvey[]>([]);
  const [uploads, setUploads] = useState<QueuedUpload[]>([]);
  const [qualityEvents, setQualityEvents] = useState<QueuedQualityEvent[]>([]);
  const [cachedRules, setCachedRules] = useState<NonNullable<BootstrapPayload['qualityRules']>>(() =>
    defaultQualityService.getEngine().getRuleManifest()
  );
  const [syncState, setSyncState] = useState<SyncState>({ running: false, lastSyncAt: null, lastError: null });
  const [deviceGps, setDeviceGps] = useState<CachedDeviceGps | null>(() => readCachedDeviceGps());
  const [gpsState, setGpsState] = useState<SessionGpsState>(() => (readCachedDeviceGps() ? 'active' : 'idle'));

  const isOnline = browserOnline && !simulatedOffline;
  const onlineRef = useRef(isOnline);
  onlineRef.current = isOnline;
  const userRef = useRef<UserAccount | null>(null);
  userRef.current = data?.user ?? null;
  const clustersRef = useRef<ClusterItem[]>([]);
  clustersRef.current = data?.clusters ?? [];
  const lastLocationPingAt = useRef(0);
  const locationPingInFlight = useRef(false);
  const flushing = useRef(false);
  const recentUploadSignatures = useRef(new Map<string, number>());
  const previewUrls = useRef(new Map<string, string[]>());

  /* ---------- toasts ---------- */
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = uuid();
      setToasts((t) => [...t.slice(-3), { id, type, text }]);
      setTimeout(() => dismissToast(id), type === 'error' ? 6500 : 3800);
    },
    [dismissToast]
  );
  /** Store mutations surface server errors as toasts, then rethrow so callers can stop their flow. */
  const fail = useCallback(
    (e: unknown): never => {
      notify(errText(e), 'error');
      throw e;
    },
    [notify]
  );

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshLocationPing = useCallback(async (force = false) => {
    const me = userRef.current;
    if (!me || locationPingInFlight.current) return;
    if (!force && Date.now() - lastLocationPingAt.current < 60_000) return;

    locationPingInFlight.current = true;
    lastLocationPingAt.current = Date.now();
    const primaryCluster = clustersRef.current.find((c) => me.assignedClusterIds.includes(c.id))?.name;
    try {
      await dispatchSessionLocationPing({
        fallbackClusterName: primaryCluster,
        isOnline: () => onlineRef.current,
        isSignedIn: () => !!userRef.current,
        postLocation: (body) => api('/auth/location', { method: 'POST', body }),
        onState: setGpsState,
        onReading: setDeviceGps,
      });
    } finally {
      locationPingInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (authStatus !== 'ready') return undefined;
    refreshLocationPing(true).catch(() => undefined);
    const id = window.setInterval(() => {
      if (onlineRef.current) refreshLocationPing().catch(() => undefined);
    }, 120_000);
    return () => window.clearInterval(id);
  }, [authStatus, isOnline, refreshLocationPing]);

  /* ---------- connectivity ---------- */
  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  /* ---------- offline queue (IndexedDB) ---------- */
  const loadQueues = useCallback(async () => {
    const [q, u, qe, cached] = await Promise.all([
      db.surveyQueue.toArray(),
      db.uploadQueue.toArray(),
      db.qualityEventQueue.toArray(),
      db.kv.get(RULES_CACHE_KEY).catch(() => undefined),
    ]);
    setQueue(q.sort((a, b) => a.queuedAt - b.queuedAt));
    setUploads(u.sort((a, b) => a.queuedAt - b.queuedAt));
    setQualityEvents(qe.sort((a, b) => a.queuedAt - b.queuedAt));
    if (Array.isArray(cached?.value)) {
      setCachedRules(cached.value as NonNullable<BootstrapPayload['qualityRules']>);
    }
  }, []);

  /* ---------- bootstrap ---------- */
  const applyBootstrap = useCallback((b: BootstrapPayload, fromSnapshot: boolean) => {
    setData(b);
    setUsingOfflineSnapshot(fromSnapshot);
    setAuthStatus('ready');
    if (b.qualityRules?.length) {
      setCachedRules(b.qualityRules);
      if (!fromSnapshot) db.kv.put({ key: RULES_CACHE_KEY, value: b.qualityRules }).catch(() => undefined);
    }
    if (!fromSnapshot) db.kv.put({ key: SNAPSHOT_KEY, value: b }).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const b = await api<BootstrapPayload>('/bootstrap', { quiet401: true });
      applyBootstrap(b, false);
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) {
        // Field mode: open with the last snapshot so volunteers can keep working without signal.
        if (!userRef.current) {
          const snap = (await db.kv.get(SNAPSHOT_KEY).catch(() => undefined))?.value as BootstrapPayload | undefined;
          if (snap) applyBootstrap(snap, true);
          else setAuthStatus('signedOut');
        }
        return;
      }
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setAuthStatus('signedOut');
        return;
      }
      throw e;
    }
  }, [applyBootstrap]);

  // A bare-minimum guard against overlapping refreshes from many mutations.
  const refreshTimer = useRef<number | undefined>();
  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      if (onlineRef.current) refresh().catch(() => undefined);
    }, 700);
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setData(null);
      setAuthStatus('signedOut');
    });
    loadQueues().catch(() => undefined);
    refresh().catch(() => setAuthStatus('signedOut'));
    return () => setUnauthorizedHandler(null);
  }, [refresh, loadQueues]);

  // Background refresh while the tab is visible (keeps dashboards current with other users' work).
  useEffect(() => {
    if (authStatus !== 'ready') return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible' && onlineRef.current) refresh().catch(() => undefined);
    }, 45_000);
    return () => window.clearInterval(t);
  }, [authStatus, refresh]);

  /* ---------- auth ---------- */
  const login = useCallback(
    async (identifier: string, password: string, app: 'admin' | 'volunteer') => {
      const user = await api<UserAccount>('/auth/login', { body: { identifier, password, app }, quiet401: true });
      await refresh();
      return user;
    },
    [refresh]
  );

  const logout = useCallback(
    async (opts: { force?: boolean } = {}) => {
      const pending =
        (await db.surveyQueue.count()) + (await db.uploadQueue.count()) + (await db.qualityEventQueue.count());
      if (pending > 0 && !opts.force) return false;
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      await clearOfflineData().catch(() => undefined);
      previewUrls.current.forEach((urls) => urls.forEach((u) => URL.revokeObjectURL(u)));
      previewUrls.current.clear();
      clearCachedDeviceGps();
      setDeviceGps(null);
      setGpsState('idle');
      setQueue([]);
      setUploads([]);
      setQualityEvents([]);
      setData(null);
      setAuthStatus('signedOut');
      return true;
    },
    []
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api('/auth/change-password', { body: { currentPassword, newPassword } }).catch(fail);
    },
    [fail]
  );

  /* ---------- local state patchers ---------- */
  const patch = useCallback((fn: (b: BootstrapPayload) => BootstrapPayload) => {
    setData((d) => (d ? fn(d) : d));
  }, []);
  const putSurvey = useCallback((s: SurveyRecord) => patch((b) => ({ ...b, surveys: upsertById(b.surveys, s) })), [patch]);
  const putDocument = useCallback((d: HouseholdDocument) => patch((b) => ({ ...b, documents: upsertById(b.documents, d) })), [patch]);

  /* ---------- sync engine ---------- */
  const flush = useCallback(
    async (force = false): Promise<number> => {
      const me = userRef.current;
      if (!me || !onlineRef.current || flushing.current) return 0;
      flushing.current = true;
      setSyncState((s) => ({ ...s, running: true, lastError: null }));
      let synced = 0;
      let lastError: string | null = null;
      const recordSurveyError = async (id: string, e: unknown): Promise<boolean> => {
        if (e instanceof ApiError && e.isNetwork) {
          lastError = e.message;
          return true;
        }
        if (e instanceof ApiError && e.status === 401) {
          // Session expired: keep the entry untouched; it syncs after the volunteer signs in again.
          lastError = e.message;
          return true;
        }
        if (e instanceof ApiError && e.status === 409) {
          await db.surveyQueue.update(id, {
            state: 'conflict',
            error: e.message,
            serverRevision: Number(e.data?.serverRevision) || undefined,
          });
        } else {
          const cur = await db.surveyQueue.get(id);
          if (cur) {
            await db.surveyQueue.update(id, {
              state: 'error',
              error: errText(e),
              attempts: cur.attempts + 1,
              nextTryAt: backoff(cur.attempts + 1),
            });
          }
        }
        lastError = errText(e);
        return false;
      };

      try {
        const now = Date.now();
        const queuedUploads = (await db.uploadQueue.toArray()).filter((u) => u.uploadedById === me.id);
        const householdsWithPendingUploads = new Set(queuedUploads.map((u) => u.householdId));
        const deferredSubmits: { id: string; record: SurveyRecord; revision: number; idempotencyKey: string }[] = [];

        const surveysDue = (await db.surveyQueue.toArray())
          .filter((q) => q.record.volunteerId === me.id && q.state !== 'conflict' && (force || q.nextTryAt <= now))
          .sort((a, b) => a.queuedAt - b.queuedAt);
        for (const q of surveysDue) {
          // If documents for this household are also queued offline, save the draft first so
          // uploads attach before the server enforces requireDocumentsForSubmission on submit.
          const deferSubmit = q.submit && householdsWithPendingUploads.has(q.id);
          const pendingQEvents = (await db.qualityEventQueue.where('surveyId').equals(q.id).toArray())
            .filter((ev) => ev.actorId === me.id)
            .sort((a, b) => a.queuedAt - b.queuedAt);
          try {
            const saved = await api<SurveyRecord>(`/surveys/${q.id}`, {
              method: 'PUT',
              body: surveyPayload(
                q.record,
                q.baseRevision,
                deferSubmit ? `${q.idempotencyKey}:draft` : q.idempotencyKey,
                deferSubmit ? false : q.submit,
                deferSubmit ? undefined : pendingQEvents
              ),
            });
            const current = await db.surveyQueue.get(q.id);
            if (deferSubmit) {
              if (current?.idempotencyKey === q.idempotencyKey) {
                const nextKey = uuid();
                await db.surveyQueue.update(q.id, { baseRevision: saved.revision, idempotencyKey: nextKey });
                deferredSubmits.push({ id: q.id, record: current.record, revision: saved.revision, idempotencyKey: nextKey });
              } else if (current) {
                await db.surveyQueue.update(q.id, { baseRevision: saved.revision });
              }
            } else {
              // Only drop the entry if it was not replaced by a newer offline edit meanwhile.
              if (current?.idempotencyKey === q.idempotencyKey) await db.surveyQueue.delete(q.id);
              else if (current) await db.surveyQueue.update(q.id, { baseRevision: saved.revision });
              if (pendingQEvents.length) await db.qualityEventQueue.bulkDelete(pendingQEvents.map((e) => e.id));
            }
            putSurvey(saved);
            synced++;
          } catch (e) {
            if (await recordSurveyError(q.id, e)) break;
          }
        }

        if (onlineRef.current) {
          const queuedSurveyIds = new Set((await db.surveyQueue.toArray()).filter((q) => q.baseRevision === 0).map((q) => q.id));
          const uploadsDue = (await db.uploadQueue.toArray())
            .filter((u) => u.uploadedById === me.id && !queuedSurveyIds.has(u.householdId) && (force || u.nextTryAt <= now))
            .sort((a, b) => a.queuedAt - b.queuedAt);
          for (const u of uploadsDue) {
            const form = new FormData();
            form.append('categoryId', u.categoryId);
            form.append('docType', u.docType);
            if (u.aadhaarLast4) form.append('aadhaarLast4', u.aadhaarLast4);
            form.append('consentConfirmed', 'true');
            form.append('clientId', u.id);
            u.files.forEach((f) => form.append('files', new File([f.blob], f.name, { type: f.type })));
            try {
              const doc = await uploadWithProgress<HouseholdDocument>(`/households/${u.householdId}/documents`, form);
              await db.uploadQueue.delete(u.id);
              previewUrls.current.get(u.id)?.forEach((x) => URL.revokeObjectURL(x));
              previewUrls.current.delete(u.id);
              putDocument(doc);
              synced++;
            } catch (e) {
              if (e instanceof ApiError && e.isNetwork) {
                lastError = e.message;
                break;
              }
              await db.uploadQueue.update(u.id, { state: 'error', error: errText(e), attempts: u.attempts + 1, nextTryAt: backoff(u.attempts + 1) });
              lastError = errText(e);
            }
          }

          for (const sub of deferredSubmits) {
            if ((await db.uploadQueue.where('householdId').equals(sub.id).count()) > 0) continue;
            const pendingQEvents = (await db.qualityEventQueue.where('surveyId').equals(sub.id).toArray())
              .filter((ev) => ev.actorId === me.id)
              .sort((a, b) => a.queuedAt - b.queuedAt);
            try {
              const submitted = await api<SurveyRecord>(`/surveys/${sub.id}`, {
                method: 'PUT',
                body: surveyPayload(sub.record, sub.revision, sub.idempotencyKey, true, pendingQEvents),
              });
              const current = await db.surveyQueue.get(sub.id);
              if (current?.idempotencyKey === sub.idempotencyKey) await db.surveyQueue.delete(sub.id);
              else if (current) await db.surveyQueue.update(sub.id, { baseRevision: submitted.revision });
              if (pendingQEvents.length) await db.qualityEventQueue.bulkDelete(pendingQEvents.map((e) => e.id));
              putSurvey(submitted);
              synced++;
            } catch (e) {
              if (await recordSurveyError(sub.id, e)) break;
            }
          }

          // Flush remaining queued quality resolution events for surveys already on the server.
          const remainingSurveyIds = new Set((await db.surveyQueue.toArray()).map((q) => q.id));
          const qEventsDue = (await db.qualityEventQueue.toArray())
            .filter((ev) => ev.actorId === me.id && !remainingSurveyIds.has(ev.surveyId) && (force || ev.nextTryAt <= Date.now()))
            .sort((a, b) => a.queuedAt - b.queuedAt);
          const eventsBySurvey = new Map<string, QueuedQualityEvent[]>();
          for (const ev of qEventsDue) {
            const arr = eventsBySurvey.get(ev.surveyId) ?? [];
            arr.push(ev);
            eventsBySurvey.set(ev.surveyId, arr);
          }
          for (const [surveyId, batch] of eventsBySurvey.entries()) {
            try {
              const saved = await api<SurveyRecord>(`/surveys/${surveyId}/quality-events`, {
                method: 'POST',
                body: {
                  events: batch.map((ev) => ({
                    ruleId: ev.ruleId,
                    action: ev.action,
                    note: ev.note,
                    clientEventId: ev.id,
                  })),
                },
              });
              await db.qualityEventQueue.bulkDelete(batch.map((b) => b.id));
              putSurvey(saved);
              synced++;
            } catch (e) {
              if (e instanceof ApiError && e.isNetwork) {
                lastError = e.message;
                break;
              }
              for (const ev of batch) {
                await db.qualityEventQueue.update(ev.id, {
                  state: 'error',
                  error: errText(e),
                  attempts: ev.attempts + 1,
                  nextTryAt: backoff(ev.attempts + 1),
                });
              }
              lastError = errText(e);
            }
          }
        }
      } finally {
        flushing.current = false;
        await loadQueues();
        setSyncState({ running: false, lastSyncAt: new Date().toISOString(), lastError });
        if (synced > 0) scheduleRefresh();
      }
      return synced;
    },
    [loadQueues, putSurvey, putDocument, scheduleRefresh]
  );

  // Retry whenever the connection returns, app foregrounds, and every 20 s while anything is pending.
  useEffect(() => {
    if (isOnline && authStatus === 'ready' && (queue.length || uploads.length || qualityEvents.length)) {
      flush().catch(() => undefined);
      const onResume = () => {
        if (document.visibilityState === 'visible' && onlineRef.current) flush().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', onResume);
      window.addEventListener('focus', onResume);
      const t = window.setInterval(() => flush().catch(() => undefined), 20_000);
      return () => {
        document.removeEventListener('visibilitychange', onResume);
        window.removeEventListener('focus', onResume);
        window.clearInterval(t);
      };
    }
    return undefined;
  }, [isOnline, authStatus, queue.length, uploads.length, qualityEvents.length, flush]);

  // When coming back online with an offline snapshot, reconnect to the server.
  useEffect(() => {
    if (isOnline && usingOfflineSnapshot) refresh().catch(() => undefined);
  }, [isOnline, usingOfflineSnapshot, refresh]);

  const syncPendingSurveys = useCallback(async () => {
    if (!onlineRef.current) {
      notify('You are offline. Pending work will sync automatically when the connection returns.', 'info');
      return 0;
    }
    const n = await flush(true);
    await refresh().catch(() => undefined);
    return n;
  }, [flush, notify, refresh]);

  /* ---------- surveys ---------- */
  const newSurveyDraft = useCallback((): SurveyRecord => {
    const me = userRef.current ?? GUEST;
    const id = uuid();
    const clusters = data?.clusters ?? [];
    const cluster = clusters.find((c) => me.assignedClusterIds.includes(c.id) && c.active) ?? clusters.find((c) => c.active);
    const profile = createEmptyProfile('', me.name.split(' ')[0] || '');
    if (cluster) {
      profile.clusterId = cluster.id;
      profile.clusterName = cluster.name;
    }
    const now = new Date().toISOString();
    return {
      id,
      householdId: id,
      surveyCode: '',
      clusterId: profile.clusterId,
      clusterName: profile.clusterName,
      volunteerId: me.id,
      volunteerName: me.name,
      status: 'DRAFT',
      revision: 0,
      consentGiven: false,
      ...initialSurveyGpsFields(),
      startedAt: now,
      profile,
      answers: {},
      reviews: [],
      createdAt: now,
      updatedAt: now,
    };
  }, [data?.clusters]);

  const enqueueSurvey = useCallback(
    async (record: SurveyRecord, submit: boolean, idempotencyKey?: string): Promise<SurveyRecord> => {
      const existing = await db.surveyQueue.get(record.id);
      const local: SurveyRecord = {
        ...record,
        status: submit ? 'PENDING_SYNC' : record.status === 'PENDING_SYNC' ? 'DRAFT' : record.status,
        updatedAt: new Date().toISOString(),
      };
      await db.surveyQueue.put({
        id: record.id,
        record: local,
        baseRevision: existing?.baseRevision ?? record.revision,
        submit: submit || (existing?.submit ?? false),
        // Reusing the key of a timed-out online attempt lets the server replay it instead of reporting a conflict.
        idempotencyKey: (!existing && idempotencyKey) || uuid(),
        attempts: 0,
        nextTryAt: Date.now(),
        queuedAt: existing?.queuedAt ?? Date.now(),
        state: existing?.state === 'conflict' ? 'conflict' : 'waiting',
        error: existing?.state === 'conflict' ? existing.error : undefined,
        serverRevision: existing?.serverRevision,
      });
      await loadQueues();
      return local;
    },
    [loadQueues]
  );

  const persistSurvey = useCallback(
    async (record: SurveyRecord, submit: boolean): Promise<SurveyRecord> => {
      const queued = await db.surveyQueue.get(record.id);
      // Documents still waiting to upload must reach the server before a submit (required-documents gate);
      // the sync engine saves the draft, uploads, then submits.
      const pendingUploads = submit ? await db.uploadQueue.where('householdId').equals(record.id).count() : 0;
      // Offline, or older edits still waiting: keep ordering by queueing this one too.
      if (!onlineRef.current || queued || pendingUploads > 0) {
        const local = await enqueueSurvey(record, submit);
        if (onlineRef.current) flush().catch(() => undefined);
        return local;
      }
      const idempotencyKey = uuid();
      try {
        const saved = await api<SurveyRecord>(`/surveys/${record.id}`, {
          method: 'PUT',
          body: surveyPayload(record, record.revision, idempotencyKey, submit),
        });
        putSurvey(saved);
        if (submit) scheduleRefresh();
        return saved;
      } catch (e) {
        // Network loss / timeout (the server may already have applied it) or an expired session: never lose the edit.
        if (e instanceof ApiError && (e.isNetwork || e.status === 401)) return enqueueSurvey(record, submit, idempotencyKey);
        return fail(e);
      }
    },
    [enqueueSurvey, flush, putSurvey, scheduleRefresh, fail]
  );

  const saveSurvey = useCallback((r: SurveyRecord) => persistSurvey(r, false), [persistSurvey]);
  const submitSurvey = useCallback((r: SurveyRecord) => persistSurvey(r, true), [persistSurvey]);

  const recordQualityAction = useCallback(
    async (
      survey: SurveyRecord,
      issue: QualityIssue,
      action: OfflineQualityAction,
      note?: string
    ): Promise<SurveyRecord> => {
      const me = userRef.current;
      if (!me) throw new Error('Not signed in.');
      const policy = data?.qualityPolicy ?? data?.study?.qualityPolicy ?? DEFAULT_QUALITY_POLICY;
      const check = defaultQualityService.validateResolutionAction({
        issue,
        action,
        note,
        actorRole: me.role,
        policy,
      });
      if (!check.ok || !check.nextStatus) {
        notify(check.error ?? 'Resolution action rejected.', 'error');
        throw new Error(check.error ?? 'Resolution action rejected.');
      }

      const clientEventId = uuid();
      const { resolutionRecord, historyEntry } = buildOptimisticQualityRecords({
        survey,
        issue,
        action,
        nextStatus: check.nextStatus,
        sanitizedNote: check.sanitizedNote,
        actorId: me.id,
        actorName: me.name,
        actorRole: me.role,
        clientEventId,
      });

      const queuedSurvey = await db.surveyQueue.get(survey.id);
      if (onlineRef.current && !queuedSurvey && survey.revision > 0) {
        try {
          const saved = await api<SurveyRecord>(`/surveys/${survey.id}/quality-events`, {
            method: 'POST',
            body: { events: [{ ruleId: issue.id, action, note: check.sanitizedNote, clientEventId }] },
          });
          putSurvey(saved);
          return saved;
        } catch (e) {
          if (!(e instanceof ApiError && e.isNetwork)) return fail(e);
        }
      }

      await db.qualityEventQueue.put({
        id: clientEventId,
        surveyId: survey.id,
        ruleId: issue.id,
        action,
        note: check.sanitizedNote,
        actorId: me.id,
        actorName: me.name,
        actorRole: me.role,
        queuedAt: Date.now(),
        attempts: 0,
        nextTryAt: Date.now(),
        state: 'waiting',
        resolutionRecord,
        historyEntry,
      });
      await loadQueues();
      const [merged] = mergeQueuedQualityEvents([survey], [
        { id: clientEventId, surveyId: survey.id, queuedAt: Date.now(), resolutionRecord, historyEntry },
      ]);
      if (onlineRef.current) flush().catch(() => undefined);
      return merged;
    },
    [data?.qualityPolicy, data?.study?.qualityPolicy, fail, flush, loadQueues, notify, putSurvey]
  );

  const overrideQualityIssues = useCallback(
    async (surveyId: string, ruleIds: string[], reason: string): Promise<SurveyRecord> => {
      const saved = await api<SurveyRecord>(`/surveys/${surveyId}/quality-override`, {
        method: 'POST',
        body: { ruleIds, reason, clientEventId: uuid() },
      }).catch(fail);
      putSurvey(saved);
      scheduleRefresh();
      return saved;
    },
    [fail, putSurvey, scheduleRefresh]
  );

  const deleteSurvey = useCallback(
    async (surveyId: string) => {
      const queued = await db.surveyQueue.get(surveyId);
      const onServer = data?.surveys.some((s) => s.id === surveyId) ?? false;
      if (onServer) {
        await api(`/surveys/${surveyId}`, { method: 'DELETE' }).catch(fail);
      }
      if (queued) await db.surveyQueue.delete(surveyId);
      const ups = await db.uploadQueue.where('householdId').equals(surveyId).toArray();
      await db.uploadQueue.bulkDelete(ups.map((u) => u.id));
      for (const u of ups) {
        previewUrls.current.get(u.id)?.forEach((x) => URL.revokeObjectURL(x));
        previewUrls.current.delete(u.id);
      }
      const qevs = await db.qualityEventQueue.where('surveyId').equals(surveyId).toArray();
      if (qevs.length) await db.qualityEventQueue.bulkDelete(qevs.map((e) => e.id));
      patch((b) => ({
        ...b,
        surveys: b.surveys.filter((s) => s.id !== surveyId),
        documents: b.documents.filter((d) => d.householdId !== surveyId),
      }));
      await loadQueues();
      scheduleRefresh();
    },
    [data?.surveys, fail, patch, loadQueues, scheduleRefresh]
  );

  const reviewSurvey = useCallback(
    async (surveyId: string, decision: ReviewDecision, reason: string) => {
      const saved = await api<SurveyRecord>(`/surveys/${surveyId}/review`, { body: { decision, reason } }).catch(fail);
      putSurvey(saved);
      scheduleRefresh();
      return saved;
    },
    [fail, putSurvey, scheduleRefresh]
  );

  const resolveConflict = useCallback(
    async (surveyId: string, keep: 'mine' | 'server') => {
      const q = await db.surveyQueue.get(surveyId);
      if (!q) return;
      if (keep === 'server') {
        await db.surveyQueue.delete(surveyId);
        await loadQueues();
        await refresh().catch(() => undefined);
        return;
      }
      let serverRevision = q.serverRevision;
      if (!serverRevision) {
        const s = await api<SurveyRecord>(`/surveys/${surveyId}`).catch(fail);
        serverRevision = s.revision;
      }
      await db.surveyQueue.update(surveyId, {
        baseRevision: serverRevision,
        idempotencyKey: uuid(),
        state: 'waiting',
        error: undefined,
        nextTryAt: Date.now(),
      });
      await loadQueues();
      await flush(true);
    },
    [fail, flush, loadQueues, refresh]
  );

  const discardQueued = useCallback(
    async (id: string) => {
      const survey = await db.surveyQueue.get(id);
      const dropIds = [id];
      if (survey?.baseRevision === 0) {
        // The household never reached the server, so its queued documents / quality events could never sync.
        const ups = await db.uploadQueue.where('householdId').equals(id).toArray();
        dropIds.push(...ups.map((u) => u.id));
        await db.uploadQueue.bulkDelete(ups.map((u) => u.id));
        const qevs = await db.qualityEventQueue.where('surveyId').equals(id).toArray();
        if (qevs.length) await db.qualityEventQueue.bulkDelete(qevs.map((e) => e.id));
      }
      await db.surveyQueue.delete(id);
      await db.uploadQueue.delete(id);
      for (const x of dropIds) {
        previewUrls.current.get(x)?.forEach((u) => URL.revokeObjectURL(u));
        previewUrls.current.delete(x);
      }
      await loadQueues();
    },
    [loadQueues]
  );

  /* ---------- documents ---------- */
  const uploadDocument = useCallback(
    async (input: UploadInput, onProgress?: (pct: number) => void): Promise<HouseholdDocument> => {
      const me = userRef.current ?? GUEST;
      const category = data?.docCategories.find((c) => c.id === input.categoryId);
      const docType = input.docType?.trim() || category?.label || 'Document';
      const sig = `${input.householdId}:${input.categoryId}:${input.files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join('|')}`;
      const existingQueued = await db.uploadQueue
        .where('householdId')
        .equals(input.householdId)
        .toArray()
        .catch(() => []);
      const dupInQueue = existingQueued.find(
        (u) => u.categoryId === input.categoryId && u.files.map((f) => `${f.name}:${f.blob.size}`).join('|') === input.files.map((f) => `${f.name}:${f.size}`).join('|')
      );
      if (dupInQueue) {
        notify('This document batch is already queued for upload.', 'info');
        return localDocs([dupInQueue])[0];
      }
      const lastSeen = recentUploadSignatures.current.get(sig);
      if (lastSeen && Date.now() - lastSeen < 10_000) {
        return fail(new Error('Duplicate upload prevented: identical files were just submitted.'));
      }
      recentUploadSignatures.current.set(sig, Date.now());

      let preparedFiles: File[];
      try {
        preparedFiles = await Promise.all(input.files.map(async (f) => (await prepareDocumentFile(f)).file));
      } catch (e) {
        recentUploadSignatures.current.delete(sig);
        return fail(e);
      }

      const clientId = uuid();
      const surveyQueued = (await db.surveyQueue.get(input.householdId))?.baseRevision === 0;

      const enqueue = async () => {
        const survey = data?.surveys.find((s) => s.householdId === input.householdId) ?? queue.find((q) => q.id === input.householdId)?.record;
        await db.uploadQueue.put({
          id: clientId,
          householdId: input.householdId,
          surveyCode: survey?.surveyCode || 'Pending code',
          headName: survey?.profile.headName ?? '',
          clusterName: survey?.clusterName ?? '',
          categoryId: input.categoryId,
          docType,
          aadhaarLast4: input.aadhaarLast4 || undefined,
          files: preparedFiles.map((f) => ({ name: f.name, type: f.type, blob: f })),
          uploadedById: me.id,
          uploadedByName: me.name,
          queuedAt: Date.now(),
          attempts: 0,
          nextTryAt: Date.now(),
          state: 'waiting',
        });
        await loadQueues();
        onProgress?.(100);
        return localDocs([await db.uploadQueue.get(clientId)].filter(Boolean) as QueuedUpload[])[0];
      };

      if (!onlineRef.current || surveyQueued) return enqueue();

      const form = new FormData();
      form.append('categoryId', input.categoryId);
      form.append('docType', docType);
      if (input.aadhaarLast4) form.append('aadhaarLast4', input.aadhaarLast4);
      form.append('consentConfirmed', 'true');
      form.append('clientId', clientId);
      preparedFiles.forEach((f) => form.append('files', f));
      try {
        const doc = await uploadWithProgress<HouseholdDocument>(`/households/${input.householdId}/documents`, form, onProgress);
        putDocument(doc);
        scheduleRefresh();
        return doc;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) return enqueue();
        recentUploadSignatures.current.delete(sig);
        return fail(e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, queue, loadQueues, putDocument, scheduleRefresh, fail, notify]
  );

  const removeDocument = useCallback(
    async (docId: string) => {
      if (await db.uploadQueue.get(docId)) {
        await discardQueued(docId);
        return;
      }
      await api(`/documents/${docId}`, { method: 'DELETE' }).catch(fail);
      patch((b) => ({ ...b, documents: b.documents.filter((d) => d.id !== docId) }));
      scheduleRefresh();
    },
    [discardQueued, fail, patch, scheduleRefresh]
  );

  const verifyDocument = useCallback(
    async (docId: string) => {
      putDocument(await api<HouseholdDocument>(`/documents/${docId}/verify`, { method: 'POST' }).catch(fail));
      scheduleRefresh();
    },
    [fail, putDocument, scheduleRefresh]
  );

  const rejectDocument = useCallback(
    async (docId: string, reason: string) => {
      putDocument(await api<HouseholdDocument>(`/documents/${docId}/reject`, { body: { reason } }).catch(fail));
      scheduleRefresh();
    },
    [fail, putDocument, scheduleRefresh]
  );

  const documentPageUrl = useCallback((doc: HouseholdDocument, pageIndex = 0, mode: 'inline' | 'view' | 'download' = 'inline') => {
    const url = doc.pages[pageIndex]?.localPreviewUrl ?? '';
    if (!url.startsWith('/api/') || mode === 'inline') return url;
    return `${url}?${mode === 'download' ? 'download=1' : 'audit=view'}`;
  }, []);

  const downloadDocument = useCallback(
    async (doc: HouseholdDocument, pageIndex = 0) => {
      const page = doc.pages[pageIndex];
      if (!page) return;
      if (!page.localPreviewUrl.startsWith('/api/')) {
        const a = document.createElement('a');
        a.href = page.localPreviewUrl;
        a.download = page.fileName;
        a.click();
        return;
      }
      await downloadFile(`${page.localPreviewUrl}?download=1`, page.fileName).catch(fail);
      scheduleRefresh();
    },
    [fail, scheduleRefresh]
  );

  /* ---------- exports ---------- */
  const downloadExport = useCallback(
    async (kind: ExportKind, params: Record<string, string | undefined> = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
      await downloadFile(`/exports/${kind}${qs ? `?${qs}` : ''}`, `m2s-${kind}`).catch(fail);
      scheduleRefresh();
    },
    [fail, scheduleRefresh]
  );

  /* ---------- administration ---------- */
  const createUser = useCallback(
    async (input: NewUserInput) => {
      const u = await api<UserAccount>('/users', { body: input }).catch(fail);
      patch((b) => ({ ...b, users: upsertById(b.users, u, false) }));
      scheduleRefresh();
      return u;
    },
    [fail, patch, scheduleRefresh]
  );

  const updateUser = useCallback(
    async (userId: string, p: Partial<Omit<UserAccount, 'id' | 'lastActive' | 'active'>>) => {
      const body: Record<string, unknown> = { ...p };
      if (body.mobile === undefined) delete body.mobile;
      const u = await api<UserAccount>(`/users/${userId}`, { method: 'PATCH', body }).catch(fail);
      patch((b) => ({ ...b, users: upsertById(b.users, u), user: b.user.id === u.id ? u : b.user }));
      scheduleRefresh();
      return u;
    },
    [fail, patch, scheduleRefresh]
  );

  const setUserActive = useCallback(
    async (userId: string, active: boolean) => {
      const u = await api<UserAccount>(`/users/${userId}/active`, { body: { active } }).catch(fail);
      patch((b) => ({ ...b, users: upsertById(b.users, u) }));
      scheduleRefresh();
    },
    [fail, patch, scheduleRefresh]
  );

  const resetUserPassword = useCallback(
    async (userId: string, password: string) => {
      await api(`/users/${userId}/reset-password`, { body: { password } }).catch(fail);
      scheduleRefresh();
    },
    [fail, scheduleRefresh]
  );

  const createCluster = useCallback(
    async (c: Omit<ClusterItem, 'id'> & { id?: string }) => {
      const saved = await api<ClusterItem>('/clusters', { body: c }).catch(fail);
      patch((b) => ({ ...b, clusters: upsertById(b.clusters, saved, false) }));
      scheduleRefresh();
      return saved;
    },
    [fail, patch, scheduleRefresh]
  );

  const updateCluster = useCallback(
    async (clusterId: string, p: Partial<Omit<ClusterItem, 'id'>>) => {
      const saved = await api<ClusterItem>(`/clusters/${clusterId}`, { method: 'PATCH', body: p }).catch(fail);
      patch((b) => ({ ...b, clusters: upsertById(b.clusters, saved) }));
      scheduleRefresh();
      return saved;
    },
    [fail, patch, scheduleRefresh]
  );

  const updateDocCategories = useCallback(
    async (cats: DocumentCategoryConfig[]) => {
      const saved = await api<DocumentCategoryConfig[]>('/settings/doc-categories', { method: 'PUT', body: { categories: cats } }).catch(fail);
      patch((b) => ({ ...b, docCategories: saved }));
      scheduleRefresh();
    },
    [fail, patch, scheduleRefresh]
  );

  const updateStudySettings = useCallback(
    async (s: StudySettings) => {
      // The API whitelists exactly these fields (qualityPolicy has its own endpoint) and rejects anything else.
      const { targetSample, allowVolunteerDelete, requireDocumentsForSubmission } = s;
      const saved = await api<StudySettings>('/settings/study', {
        method: 'PUT',
        body: { targetSample, allowVolunteerDelete, requireDocumentsForSubmission },
      }).catch(fail);
      patch((b) => ({ ...b, study: saved }));
      scheduleRefresh();
    },
    [fail, patch, scheduleRefresh]
  );

  const updateQualityPolicy = useCallback(
    async (p: QualityPolicyConfig) => {
      const saved = await api<QualityPolicyConfig>('/settings/quality-policy', { method: 'PUT', body: p }).catch(fail);
      patch((b) => ({ ...b, qualityPolicy: saved, study: { ...b.study, qualityPolicy: saved } }));
      scheduleRefresh();
    },
    [fail, patch, scheduleRefresh]
  );

  const markNotificationsRead = useCallback(async () => {
    patch((b) => ({ ...b, notifications: b.notifications.map((n) => ({ ...n, unread: false })) }));
    await api('/notifications/read', { method: 'POST' }).catch(() => undefined);
  }, [patch]);

  const logAudit = useCallback(
    (action: string, entity: string, entityId: string, summary: string) => {
      api('/audit', { body: { action, entity, entityId: entityId.slice(0, 80), summary: summary.slice(0, 300) } })
        .then(scheduleRefresh)
        .catch(() => undefined);
    },
    [scheduleRefresh]
  );

  /* ---------- derived data: server data merged with on-device queue ---------- */
  const me = data?.user ?? null;

  const localDocs = useCallback((list: QueuedUpload[]): HouseholdDocument[] => {
    return list.map((u) => {
      let urls = previewUrls.current.get(u.id);
      if (!urls) {
        urls = u.files.map((f) => URL.createObjectURL(f.blob));
        previewUrls.current.set(u.id, urls);
      }
      return {
        id: u.id,
        householdId: u.householdId,
        surveyCode: u.surveyCode,
        headName: u.headName,
        clusterName: u.clusterName,
        categoryId: u.categoryId,
        docType: u.docType,
        aadhaarLast4: u.aadhaarLast4,
        consentConfirmed: true,
        uploadStatus: u.state === 'error' ? 'UPLOAD_FAILED' : 'LOCAL_ONLY',
        uploadProgress: 0,
        verificationStatus: 'PENDING',
        rejectionReason: u.error,
        uploadedById: u.uploadedById,
        uploadedByName: u.uploadedByName,
        uploadedAt: new Date(u.queuedAt).toISOString(),
        pages: u.files.map((f, i) => ({
          id: `${u.id}-p${i + 1}`,
          pageNo: i + 1,
          fileName: f.name,
          mime: (f.type as 'image/jpeg' | 'image/png' | 'application/pdf') || 'image/jpeg',
          sizeBytes: f.blob.size,
          localPreviewUrl: urls![i],
        })),
      };
    });
  }, []);

  const myQueue = useMemo(() => (me ? queue.filter((q) => q.record.volunteerId === me.id) : []), [queue, me]);
  const myUploads = useMemo(() => (me ? uploads.filter((u) => u.uploadedById === me.id) : []), [uploads, me]);
  const myQualityEvents = useMemo(
    () => (me ? qualityEvents.filter((ev) => ev.actorId === me.id) : []),
    [qualityEvents, me]
  );

  const surveys = useMemo(() => {
    let list = data?.surveys ?? [];
    for (const q of myQueue) list = upsertById(list, { ...q.record, status: q.submit ? 'PENDING_SYNC' : q.record.status });
    return mergeQueuedQualityEvents(list, myQualityEvents);
  }, [data?.surveys, myQueue, myQualityEvents]);

  const documents = useMemo(() => [...localDocs(myUploads), ...(data?.documents ?? [])], [data?.documents, myUploads, localDocs]);
  const pendingIds = useMemo(
    () => new Set([...myQueue.map((q) => q.id), ...myQualityEvents.map((e) => e.surveyId)]),
    [myQueue, myQualityEvents]
  );
  const isPendingSync = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  const qualityPolicy = data?.qualityPolicy ?? data?.study?.qualityPolicy ?? DEFAULT_QUALITY_POLICY;

  const value: AppContextValue = {
    authStatus,
    isAuthenticated: authStatus === 'ready' && !!data,
    currentUser: data?.user ?? GUEST,
    login,
    logout,
    changePassword,
    refresh,
    usingOfflineSnapshot,
    isOnline,
    simulatedOffline,
    setSimulatedOffline,
    language,
    setLanguage,
    users: data?.users ?? [],
    clusters: data?.clusters ?? [],
    surveys,
    documents,
    docCategories: data?.docCategories ?? [],
    study: data?.study ?? DEFAULT_STUDY,
    qualityPolicy,
    qualityRules: cachedRules,
    auditLogs: data?.auditLogs ?? [],
    notifications: data?.notifications ?? [],
    toasts,
    dismissToast,
    notify,
    newSurveyDraft,
    saveSurvey,
    submitSurvey,
    recordQualityAction,
    overrideQualityIssues,
    deleteSurvey,
    reviewSurvey,
    uploadDocument,
    removeDocument,
    verifyDocument,
    rejectDocument,
    documentPageUrl,
    downloadDocument,
    pendingSurveys: myQueue,
    pendingUploads: myUploads,
    pendingQualityEvents: myQualityEvents,
    pendingCount: myQueue.length + myUploads.length + myQualityEvents.length,
    isPendingSync,
    syncState,
    syncPendingSurveys,
    resolveConflict,
    discardQueued,
    downloadExport,
    createUser,
    updateUser,
    setUserActive,
    resetUserPassword,
    createCluster,
    updateCluster,
    updateDocCategories,
    updateStudySettings,
    updateQualityPolicy,
    markNotificationsRead,
    logAudit,
    deviceGps,
    gpsState,
    refreshLocationPing,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useAppStore(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppStore must be used inside <AppProvider>');
  return ctx;
}

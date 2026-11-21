import Dexie, { Table } from 'dexie';
import type { QualityResolutionRecord, Role, SurveyRecord, ValidationHistoryEntry } from './types/survey';

/**
 * On-device offline store (IndexedDB). Cleared on sign-out.
 *  - surveyQueue: survey saves/submissions waiting for the network (one entry per survey, latest wins)
 *  - uploadQueue: document pages captured offline (Blobs) waiting to upload
 *  - qualityEventQueue: quality checker verification/override events waiting for sync (clientEventId deduplicated)
 *  - kv: last bootstrap snapshot and cached validation rules so the field app opens without network
 */
export type QualityEventAction = 'UNDER_REVIEW' | 'VERIFIED' | 'ACKNOWLEDGED' | 'SUPERVISOR_APPROVE' | 'SUPERVISOR_WAIVE';

export interface QueuedQualityEvent {
  id: string; // clientEventId
  surveyId: string;
  ruleId: string;
  action: QualityEventAction;
  note?: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  queuedAt: number;
  attempts: number;
  nextTryAt: number;
  state: 'waiting' | 'error';
  error?: string;
  resolutionRecord?: QualityResolutionRecord;
  historyEntry?: ValidationHistoryEntry;
}
export interface QueuedSurvey {
  id: string;
  record: SurveyRecord;
  /** Server revision the edit was based on (0 = not yet on server). */
  baseRevision: number;
  submit: boolean;
  idempotencyKey: string;
  attempts: number;
  nextTryAt: number;
  queuedAt: number;
  /** 'conflict' needs a user decision; 'error' is retried automatically. */
  state: 'waiting' | 'error' | 'conflict';
  error?: string;
  serverRevision?: number;
}

export interface QueuedUpload {
  id: string; // client document UUID (sent as clientId → idempotent)
  householdId: string;
  surveyCode: string;
  headName: string;
  clusterName: string;
  categoryId: string;
  docType: string;
  aadhaarLast4?: string;
  files: { name: string; type: string; blob: Blob }[];
  uploadedById: string;
  uploadedByName: string;
  queuedAt: number;
  attempts: number;
  nextTryAt: number;
  state: 'waiting' | 'error';
  error?: string;
}

class M2SDb extends Dexie {
  surveyQueue!: Table<QueuedSurvey, string>;
  uploadQueue!: Table<QueuedUpload, string>;
  qualityEventQueue!: Table<QueuedQualityEvent, string>;
  kv!: Table<{ key: string; value: unknown }, string>;
  constructor() {
    super('m2s');
    this.version(1).stores({ drafts: 'householdId,state,nextTryAt' });
    this.version(2).stores({
      drafts: null,
      surveyQueue: 'id,state,nextTryAt',
      uploadQueue: 'id,householdId,state,nextTryAt',
      kv: 'key',
    });
    this.version(3).stores({
      drafts: null,
      surveyQueue: 'id,state,nextTryAt',
      uploadQueue: 'id,householdId,state,nextTryAt',
      qualityEventQueue: 'id,surveyId,ruleId,state,nextTryAt,queuedAt',
      kv: 'key',
    });
  }
}

export const db = new M2SDb();

export async function clearOfflineData() {
  await Promise.all([db.surveyQueue.clear(), db.uploadQueue.clear(), db.qualityEventQueue.clear(), db.kv.clear()]);
}

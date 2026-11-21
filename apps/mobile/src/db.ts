import Dexie, { type Table } from 'dexie';
import type { QualityResolutionRecord, Role, SurveyRecord, ValidationHistoryEntry } from '@m2s/shared/types/survey';

export type QueueState = 'waiting' | 'error' | 'conflict';
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
  baseRevision: number;
  submit: boolean;
  idempotencyKey: string;
  attempts: number;
  nextTryAt: number;
  queuedAt: number;
  state: QueueState;
  error?: string;
  serverRevision?: number;
}

export interface QueuedFile {
  name: string;
  type: string;
  blob: Blob;
}

export interface QueuedUpload {
  id: string;
  householdId: string;
  surveyCode: string;
  headName: string;
  clusterName: string;
  categoryId: string;
  docType: string;
  aadhaarLast4?: string;
  files: QueuedFile[];
  uploadedById: string;
  uploadedByName: string;
  queuedAt: number;
  attempts: number;
  nextTryAt: number;
  state: 'waiting' | 'error';
  error?: string;
}

class MobileOfflineDb extends Dexie {
  surveyQueue!: Table<QueuedSurvey, string>;
  uploadQueue!: Table<QueuedUpload, string>;
  qualityEventQueue!: Table<QueuedQualityEvent, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('m2s_mobile_offline');
    this.version(1).stores({
      surveyQueue: 'id, state, nextTryAt, queuedAt',
      uploadQueue: 'id, householdId, state, nextTryAt, queuedAt',
      kv: 'key',
    });
    this.version(2).stores({
      surveyQueue: 'id, state, nextTryAt, queuedAt',
      uploadQueue: 'id, householdId, state, nextTryAt, queuedAt',
      qualityEventQueue: 'id, surveyId, ruleId, state, nextTryAt, queuedAt',
      kv: 'key',
    });
  }
}

export const db = new MobileOfflineDb();

export async function clearOfflineData() {
  await db.transaction('rw', db.surveyQueue, db.uploadQueue, db.qualityEventQueue, db.kv, async () => {
    await db.surveyQueue.clear();
    await db.uploadQueue.clear();
    await db.qualityEventQueue.clear();
    await db.kv.clear();
  });
}


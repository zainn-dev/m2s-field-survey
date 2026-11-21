import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  GitMerge,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { VolunteerLayout } from '../../components/layout/VolunteerLayout';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { relativeTime } from '../../components/dashboard/format';
import { useAppStore } from '../../store/appStore';

const card = 'bg-white rounded-[14px] border border-[#E7E2D4] shadow-[0_1px_2px_rgba(24,22,17,0.04)]';

type QueueState = 'waiting' | 'error' | 'conflict';

const STATE_STYLE: Record<QueueState, { label: string; cls: string; icon: React.ElementType }> = {
  waiting: { label: 'Waiting', cls: 'bg-[#FEF5D9] text-[#9A6800] border-[#F6E19C]', icon: Clock },
  error: { label: 'Error', cls: 'bg-[#FDECEA] text-[#C93B32] border-[#F2C9C5]', icon: XCircle },
  conflict: { label: 'Conflict', cls: 'bg-[#FDECEA] text-[#C93B32] border-[#F2C9C5]', icon: GitMerge },
};

const StatePill: React.FC<{ state: QueueState }> = ({ state }) => {
  const s = STATE_STYLE[state];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
};

const ts = (ms: number) => relativeTime(new Date(ms).toISOString());

interface DiscardTarget {
  id: string;
  label: string;
  kind: 'survey' | 'upload';
  isNew: boolean;
}

export const VolunteerSync: React.FC = () => {
  const navigate = useNavigate();
  const {
    isOnline,
    simulatedOffline,
    setSimulatedOffline,
    pendingSurveys,
    pendingUploads,
    pendingCount,
    syncState,
    syncPendingSurveys,
    resolveConflict,
    discardQueued,
    notify,
    language,
  } = useAppStore();
  const hi = language === 'hi';
  const [syncing, setSyncing] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [discard, setDiscard] = useState<DiscardTarget | null>(null);

  const busy = syncing || syncState.running;

  const runSync = async () => {
    setSyncing(true);
    try {
      const n = await syncPendingSurveys();
      if (isOnline) notify(`Synced ${n} item(s)`);
    } catch {
      /* store already toasted */
    } finally {
      setSyncing(false);
    }
  };

  const resolve = async (id: string, keep: 'mine' | 'server') => {
    setResolving(`${id}:${keep}`);
    try {
      await resolveConflict(id, keep);
      notify(keep === 'mine' ? 'Your version will be sent to the server' : 'Server version restored');
    } catch {
      /* store already toasted */
    } finally {
      setResolving(null);
    }
  };

  const confirmDiscard = async () => {
    if (!discard) return;
    await discardQueued(discard.id);
    notify('Removed from the sync queue');
    setDiscard(null);
  };

  const conflicts = pendingSurveys.filter((q) => q.state === 'conflict').length;

  return (
    <VolunteerLayout title={hi ? 'सिंक' : 'Sync'} onBack={() => navigate('/volunteer')}>
      <div className="px-4 py-4 space-y-4 flex-1">
        {/* Connection + sync now */}
        <section className={`${card} p-4`}>
          <div className="flex items-center gap-3">
            <span
              className={`w-11 h-11 rounded-[10px] flex items-center justify-center shrink-0 ${
                isOnline ? 'bg-[#FFF8D6] text-[#8C6200]' : 'bg-[#FFF5E0] text-[#B26B00]'
              }`}
            >
              {isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold text-[#181611]">{isOnline ? 'Online' : 'Offline'}</div>
              <p className="text-[12.5px] text-[#726C5D] mt-0.5">
                {syncState.lastSyncAt ? `Last synced ${relativeTime(syncState.lastSyncAt)}` : 'No sync yet this session'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[22px] font-bold leading-none text-[#181611]">{pendingCount}</div>
              <div className="text-[11.5px] text-[#726C5D] mt-1">queued</div>
            </div>
          </div>

          {syncState.lastError && (
            <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#F2C9C5] bg-[#FDECEA] px-3 py-2 text-[12.5px] text-[#C93B32]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{syncState.lastError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={runSync}
            disabled={busy || !isOnline}
            className="mt-4 w-full h-11 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-60 disabled:hover:bg-[#E5B00D] text-[#181611] text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
          {!isOnline && (
            <p className="mt-2 text-[12px] text-[#726C5D] text-center">
              Queued work will sync automatically when the connection returns.
            </p>
          )}
        </section>

        {conflicts > 0 && (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-[#F2C9C5] bg-[#FDF3F2] px-4 py-3 text-[13px] text-[#8E2A24]">
            <GitMerge className="w-4 h-4 shrink-0 mt-0.5 text-[#C93B32]" />
            <span>
              {conflicts} survey{conflicts === 1 ? ' was' : 's were'} changed on the server while you were editing. Choose which
              version to keep.
            </span>
          </div>
        )}

        {/* Survey queue */}
        <section className={card}>
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#181611]">Surveys</h2>
            <span className="text-[12px] text-[#726C5D]">{pendingSurveys.length} queued</span>
          </div>
          {pendingSurveys.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-[#726C5D] inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#8C6200]" />
              All surveys are synced.
            </p>
          ) : (
            <ul className="divide-y divide-[#EFECE2] border-t border-[#EFECE2]">
              {pendingSurveys.map((q) => {
                const name = q.record.profile.headName || 'Unnamed household';
                const isNew = q.baseRevision === 0;
                return (
                  <li key={q.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-[10px] bg-[#EFECE2] text-[#5C5547] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-semibold text-[#181611] truncate">{name}</div>
                            <div className="text-[12px] text-[#726C5D] truncate">
                              {q.record.surveyCode || 'Not yet synced'} · {q.submit ? 'Submission' : 'Draft save'} · queued{' '}
                              {ts(q.queuedAt)}
                            </div>
                          </div>
                          <StatePill state={q.state} />
                        </div>
                        {(q.attempts > 0 || q.error) && (
                          <div className="mt-1.5 text-[12px]">
                            {q.attempts > 0 && (
                              <span className="text-[#726C5D]">
                                {q.attempts} attempt{q.attempts === 1 ? '' : 's'}
                              </span>
                            )}
                            {q.error && <p className="text-[#C93B32] mt-0.5 break-words">{q.error}</p>}
                          </div>
                        )}

                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {q.state === 'conflict' && (
                            <>
                              <button
                                type="button"
                                disabled={!!resolving || !isOnline}
                                onClick={() => resolve(q.id, 'mine')}
                                className="h-9 px-3 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-60 text-[#181611] text-[12.5px] font-semibold inline-flex items-center gap-1.5"
                              >
                                {resolving === `${q.id}:mine` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Keep my version
                              </button>
                              <button
                                type="button"
                                disabled={!!resolving || !isOnline}
                                onClick={() => resolve(q.id, 'server')}
                                className="h-9 px-3 rounded-[10px] border border-[#E7E2D4] bg-white hover:bg-[#FAF8F2] disabled:opacity-60 text-[#181611] text-[12.5px] font-semibold inline-flex items-center gap-1.5"
                              >
                                {resolving === `${q.id}:server` && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Use server version
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => navigate(`/volunteer/surveys/${q.id}`)}
                            className="h-9 px-3 rounded-[10px] border border-[#E7E2D4] bg-white hover:bg-[#FAF8F2] text-[#181611] text-[12.5px] font-semibold"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => setDiscard({ id: q.id, label: name, kind: 'survey', isNew })}
                            className="h-9 px-3 rounded-[10px] text-[#C93B32] hover:bg-[#FDECEA] text-[12.5px] font-semibold inline-flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Discard
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Upload queue */}
        <section className={card}>
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#181611]">Document uploads</h2>
            <span className="text-[12px] text-[#726C5D]">{pendingUploads.length} queued</span>
          </div>
          {pendingUploads.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-[#726C5D] inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-[#8C6200]" />
              All documents are uploaded.
            </p>
          ) : (
            <ul className="divide-y divide-[#EFECE2] border-t border-[#EFECE2]">
              {pendingUploads.map((u) => (
                <li key={u.id} className="px-4 py-3 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-[10px] bg-[#EFECE2] text-[#5C5547] flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-[#181611] truncate">{u.docType}</div>
                        <div className="text-[12px] text-[#726C5D] truncate">
                          {u.headName || 'Unnamed household'} · {u.files.length} page{u.files.length === 1 ? '' : 's'} · queued{' '}
                          {ts(u.queuedAt)}
                        </div>
                      </div>
                      <StatePill state={u.state} />
                    </div>
                    {(u.attempts > 0 || u.error) && (
                      <div className="mt-1.5 text-[12px]">
                        {u.attempts > 0 && (
                          <span className="text-[#726C5D]">
                            {u.attempts} attempt{u.attempts === 1 ? '' : 's'}
                          </span>
                        )}
                        {u.error && <p className="text-[#C93B32] mt-0.5 break-words">{u.error}</p>}
                      </div>
                    )}
                    <div className="mt-2.5">
                      <button
                        type="button"
                        onClick={() => setDiscard({ id: u.id, label: `${u.docType} (${u.headName || 'household'})`, kind: 'upload', isNew: true })}
                        className="h-9 px-3 rounded-[10px] text-[#C93B32] hover:bg-[#FDECEA] text-[12.5px] font-semibold inline-flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Discard
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Testing aid */}
        <section className={`${card} p-4`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-[#181611]">Simulate offline</div>
              <p className="text-[12px] text-[#726C5D] mt-0.5">
                Testing aid: pretend the device has no network so you can check offline saving.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={simulatedOffline}
              aria-label="Simulate offline"
              onClick={() => setSimulatedOffline(!simulatedOffline)}
              className={`relative w-11 h-6 rounded-full shrink-0 transition ${simulatedOffline ? 'bg-[#C77A0A]' : 'bg-[#DFD9C8]'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  simulatedOffline ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={!!discard}
        variant="danger"
        title={discard?.kind === 'upload' ? 'Discard this upload?' : 'Discard queued changes?'}
        description={
          discard?.kind === 'upload' ? (
            <>
              The captured pages for <strong>{discard.label}</strong> exist only on this device and will be deleted.
            </>
          ) : discard?.isNew ? (
            <>
              The survey for <strong>{discard?.label}</strong> has never reached the server. Discarding it deletes it from
              this device permanently.
            </>
          ) : (
            <>
              Your unsynced changes to <strong>{discard?.label}</strong> will be lost. The last version on the server is kept.
            </>
          )
        }
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        onCancel={() => setDiscard(null)}
      />
    </VolunteerLayout>
  );
};

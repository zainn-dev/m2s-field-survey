import React from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, FileText, Loader2, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { useMobileStore } from '../store/mobileStore';
import { MobileLayout } from '../components/MobileLayout';

export const VolunteerSync: React.FC = () => {
  const {
    isOnline,
    pendingSurveys,
    pendingUploads,
    pendingCount,
    syncState,
    syncPendingSurveys,
    resolveConflict,
    discardQueued,
    serverOrigin,
    language,
    notify,
  } = useMobileStore();
  const hi = language === 'hi';

  // Queued work exists only on this device: discarding it is permanent, so always confirm first.
  const confirmDiscard = (id: string, what: string) => {
    const msg = hi
      ? `यह ${what} अभी सर्वर पर नहीं पहुँचा है। हटाने के बाद इसे वापस नहीं लाया जा सकता। हटाएँ?`
      : `This ${what} has not reached the server yet. Discarding it cannot be undone. Discard?`;
    if (window.confirm(msg)) void discardQueued(id);
  };

  const handleResolve = async (id: string, keep: 'mine' | 'server') => {
    if (
      keep === 'server' &&
      !window.confirm(hi ? 'इस डिवाइस के बदलाव हटा दिए जाएँगे। जारी रखें?' : 'Your changes on this device will be discarded. Continue?')
    ) {
      return;
    }
    try {
      await resolveConflict(id, keep);
      notify(keep === 'mine' ? 'Your version will be sent to the server.' : 'Server version restored.');
    } catch {
      /* the store already showed the error toast */
    }
  };

  const conflicts = pendingSurveys.filter((q) => q.state === 'conflict');
  const waitingSurveys = pendingSurveys.filter((q) => q.state !== 'conflict');

  return (
    <MobileLayout title={hi ? 'ऑफ़लाइन सिंक' : 'Offline Sync'}>
      {/* Connectivity Card */}
      <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-10 h-10 rounded-xl grid place-items-center ${
                isOnline ? 'bg-[#FFF5C0] text-[#8C6200]' : 'bg-[#FDE2E1] text-[#B42318]'
              }`}
            >
              {isOnline ? <Wifi className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-[#181611]">
                {isOnline ? 'Connected to M2S Server' : 'Working Offline'}
              </h2>
              <p className="text-[11.5px] text-[#5C5547] font-mono truncate max-w-[210px]">
                {serverOrigin || 'Same-origin API'}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!isOnline || syncState.running || pendingCount === 0}
            onClick={() => syncPendingSurveys()}
            className="h-10 px-3.5 rounded-[10px] bg-[#FDC513] disabled:opacity-50 text-[#181611] text-[13px] font-bold inline-flex items-center gap-1.5"
          >
            {syncState.running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync Now
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div className="rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] py-2">
            <div className="text-[17px] font-extrabold text-[#181611]">{waitingSurveys.length}</div>
            <div className="text-[11px] text-[#5C5547]">Surveys Queued</div>
          </div>
          <div className="rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] py-2">
            <div className="text-[17px] font-extrabold text-[#181611]">{pendingUploads.length}</div>
            <div className="text-[11px] text-[#5C5547]">Docs Queued</div>
          </div>
          <div className="rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4] py-2">
            <div className="text-[17px] font-extrabold text-[#B42318]">{conflicts.length}</div>
            <div className="text-[11px] text-[#5C5547]">Conflicts</div>
          </div>
        </div>

        {syncState.lastSyncAt && (
          <p className="text-[11.5px] text-[#5C5547]">
            Last check: {new Date(syncState.lastSyncAt).toLocaleTimeString()}
            {syncState.lastError ? ` · Last note: ${syncState.lastError}` : ''}
          </p>
        )}
      </section>

      {/* Clean State */}
      {pendingCount === 0 && (
        <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-6 text-center space-y-2">
          <CheckCircle2 className="w-9 h-9 text-[#8C6200] mx-auto" />
          <h3 className="text-[15px] font-bold text-[#181611]">All field records synced</h3>
          <p className="text-[12.5px] text-[#5C5547]">
            Your device surveys and documents are up to date with the Miles2Smile server.
          </p>
        </div>
      )}

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-[14px] font-bold text-[#B42318] flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Revision Conflicts ({conflicts.length})
          </h3>
          {conflicts.map((q) => (
            <div key={q.id} className="bg-white rounded-[14px] border border-[#F5C6C2] p-3.5 space-y-2.5">
              <div>
                <div className="text-[14px] font-bold text-[#181611]">
                  {q.record.profile.headName || 'Household Survey'} ({q.record.surveyCode || 'Draft'})
                </div>
                <p className="text-[12px] text-[#B42318] mt-0.5">
                  {q.error || `Edited on server (rev ${q.serverRevision ?? '?'}) since this device started at rev ${q.baseRevision}.`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleResolve(q.id, 'mine')}
                  className="flex-1 h-9 rounded-[10px] bg-[#FDC513] text-[#181611] text-[12.5px] font-semibold"
                >
                  Keep My Version
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolve(q.id, 'server')}
                  className="flex-1 h-9 rounded-[10px] border border-[#DFD9C8] text-[#181611] text-[12.5px] font-semibold"
                >
                  Use Server Copy
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Pending Surveys */}
      {waitingSurveys.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[14px] font-bold text-[#181611]">Queued Surveys ({waitingSurveys.length})</h3>
          {waitingSurveys.map((q) => (
            <div key={q.id} className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-[#181611] truncate">
                  {q.record.profile.headName || 'Unnamed Household'} {q.submit ? '(Submit)' : '(Draft)'}
                </div>
                <p className="text-[12px] text-[#5C5547]">
                  {q.record.clusterName || 'No Cluster'} · Attempts: {q.attempts} ·{' '}
                  {q.state === 'error' ? q.error || 'Retry pending' : 'Waiting to sync'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => confirmDiscard(q.id, hi ? 'सर्वे' : 'survey')}
                aria-label="Discard queued survey"
                className="p-2 rounded-lg text-[#B42318] hover:bg-[#FDECEA]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Pending Uploads */}
      {pendingUploads.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[14px] font-bold text-[#181611]">Queued Documents ({pendingUploads.length})</h3>
          {pendingUploads.map((u) => (
            <div key={u.id} className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <FileText className="w-5 h-5 text-[#8C6200] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[14px] font-bold text-[#181611] truncate">{u.docType}</div>
                  <p className="text-[12px] text-[#5C5547]">
                    {u.headName || u.surveyCode || 'Household'} · {u.files.length} page(s) · Attempts: {u.attempts}
                  </p>
                  {u.error && <p className="text-[11.5px] text-[#B42318] mt-0.5">{u.error}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => confirmDiscard(u.id, hi ? 'दस्तावेज़' : 'document')}
                aria-label="Discard queued document"
                className="p-2 rounded-lg text-[#B42318] hover:bg-[#FDECEA]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </section>
      )}
    </MobileLayout>
  );
};


import React, { useEffect, useState } from 'react';
import { Loader2, Server } from 'lucide-react';
import { checkApiHealth, defaultApiOrigin, getApiOrigin, normalizeApiOrigin } from '../api/http';
import { useMobileStore } from '../store/mobileStore';

/**
 * API server address editor. The address is only saved after the health check confirms it is an M2S API,
 * so a typo can never strand the app. Switching servers signs the volunteer out (tokens are per server).
 */
export const ServerOriginForm: React.FC<{ signedIn: boolean }> = ({ signedIn }) => {
  const { serverOrigin, updateServerOrigin, notify } = useMobileStore();
  const [draft, setDraft] = useState(serverOrigin);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(serverOrigin), [serverOrigin]);

  const handleSave = async () => {
    if (busy) return;
    let normalized: string;
    try {
      normalized = normalizeApiOrigin(draft);
    } catch (e) {
      notify((e as Error).message, 'error');
      return;
    }
    setBusy(true);
    try {
      const health = await checkApiHealth(normalized);
      if (!health.ok) {
        notify(`${health.error || 'Health check failed.'} The server address was not changed.`, 'error');
        return;
      }
      const changed = (normalized || defaultApiOrigin()) !== getApiOrigin();
      const saved = await updateServerOrigin(normalized);
      setDraft(saved);
      notify(changed && signedIn ? 'API server verified and saved. Please sign in again on the new server.' : 'API server verified and saved.', 'success');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save the server address.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-2.5">
      <h3 className="text-[14px] font-bold text-[#181611] flex items-center gap-1.5">
        <Server className="w-4 h-4 text-[#8C6200]" /> M2S API Endpoint
      </h3>
      <div className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://api.example.org"
          aria-label="API server address"
          className="flex-1 min-w-0 h-10 rounded-[10px] border border-[#DFD9C8] px-3 text-[13px] font-mono"
        />
        <button
          type="button"
          disabled={busy}
          onClick={handleSave}
          className="h-10 px-3 rounded-[10px] bg-[#181611] text-[#FDC513] text-[12px] font-bold inline-flex items-center gap-1 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save & Test
        </button>
      </div>
      <p className="text-[11.5px] text-[#726C5D]">Leave empty to use the default server.</p>
    </section>
  );
};

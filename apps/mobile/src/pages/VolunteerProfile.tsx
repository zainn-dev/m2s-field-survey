import React, { useEffect, useState } from 'react';
import { Download, LogOut, RefreshCw, ShieldCheck, Sparkles, User } from 'lucide-react';
import { ConfirmDialog } from '@m2s/shared/components/ConfirmDialog';
import { StatusBadge } from '@m2s/shared/components/StatusBadge';
import { UpdateModal } from '@m2s/shared/components/UpdateModal';
import {
  fetchServerAppVersion,
  isUpdateAvailable,
  LOCAL_APP_VERSION,
  type AppVersionPayload,
} from '@m2s/shared/utils/appUpdate';
import { getApiOrigin } from '../api/http';
import { useMobileStore } from '../store/mobileStore';
import { MobileLayout } from '../components/MobileLayout';

export const VolunteerProfile: React.FC = () => {
  const {
    currentUser,
    clusters,
    pendingCount,
    logout,
    language,
  } = useMobileStore();
  const hi = language === 'hi';

  const [confirmForceLogout, setConfirmForceLogout] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppVersionPayload | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState('');
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const checkUpdates = async (manual: boolean = false) => {
    setChecking(true);
    setCheckMessage('');
    try {
      const info = await fetchServerAppVersion(getApiOrigin());
      if (info) {
        setUpdateInfo(info);
        const ready = isUpdateAvailable(LOCAL_APP_VERSION, info);
        setHasUpdate(ready);
        if (ready) {
          if (manual) setShowUpdateModal(true);
        } else if (manual) {
          setCheckMessage(hi ? '✓ आपका ऐप बिल्कुल नवीनतम वर्शन पर है।' : '✓ App is up to date.');
        }
      } else if (manual) {
        setCheckMessage(hi ? 'अपडेट सर्वर से कनेक्ट नहीं हो सका।' : 'Could not reach update server.');
      }
    } catch {
      if (manual) setCheckMessage(hi ? 'अपडेट सर्वर से कनेक्ट नहीं हो सका।' : 'Could not reach update server.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkUpdates(false);
  }, []);

  const assignedNames = clusters
    .filter((c) => currentUser.assignedClusterIds.includes(c.id))
    .map((c) => c.name);

  const handleLogout = async () => {
    const ok = await logout();
    if (!ok) {
      setConfirmForceLogout(true);
    }
  };

  return (
    <MobileLayout title={hi ? 'वालंटियर प्रोफ़ाइल' : 'Volunteer Profile'}>
      {/* Account Details */}
      <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-[#181611] text-[#FDC513] grid place-items-center shrink-0">
            <User className="w-6 h-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-[#181611] truncate">{currentUser.name}</h2>
            <p className="text-[12.5px] text-[#5C5547] truncate">{currentUser.email || currentUser.mobile}</p>
          </div>
          <StatusBadge status={currentUser.role} />
        </div>

        <div className="pt-2 border-t border-[#EFECE2] text-[12.5px] space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#5C5547]">Mobile:</span>
            <span className="font-semibold text-[#181611]">{currentUser.mobile || '—'}</span>
          </div>
          <div className="flex justify-between items-start gap-4">
            <span className="text-[#5C5547] shrink-0">Assigned Clusters:</span>
            <span className="font-semibold text-[#181611] text-right">
              {assignedNames.length ? assignedNames.join(', ') : 'All active clusters'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#5C5547]">Pending Offline Sync:</span>
            <span className="font-semibold text-[#8C6200]">{pendingCount} items</span>
          </div>
        </div>
      </section>

      {/* App Version & In-App Updates */}
      <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-[#FFF8D6] text-[#8C6200] grid place-items-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-[14px] font-bold text-[#181611]">
                {hi ? 'ऐप वर्शन और अपडेट' : 'App Version & Updates'}
              </h3>
              <p className="text-[11.5px] text-[#5C5547]">
                {hi ? 'फील्ड ऐप वर्शन:' : 'Installed version:'} <span className="font-mono font-semibold text-[#181611]">v{LOCAL_APP_VERSION.version}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => checkUpdates(true)}
            disabled={checking}
            className="h-8 px-3 rounded-lg bg-[#FAF8F2] hover:bg-[#F2EEE2] border border-[#E7E2D4] text-[12px] font-semibold text-[#181611] inline-flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin text-[#8C6200]' : 'text-[#726C5D]'}`} />
            {checking ? (hi ? 'जांच...' : 'Checking...') : (hi ? 'अपडेट जांचें' : 'Check')}
          </button>
        </div>

        {checkMessage && (
          <p className="text-[12px] font-medium text-[#2E7D32] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-3 py-1.5">
            {checkMessage}
          </p>
        )}

        {hasUpdate && updateInfo && (
          <div className="rounded-[12px] bg-[#FFFDF2] border border-[#EED77C] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-[#181611]">
                ⚡ {hi ? `नया वर्शन उपलब्ध: v${updateInfo.version}` : `New Version Available: v${updateInfo.version}`}
              </span>
              <span className="text-[11px] font-mono text-[#8C6200] font-bold">
                {updateInfo.apkSize || '7.4 MB'}
              </span>
            </div>
            <p className="text-[11.5px] text-[#5C4100] line-clamp-2">
              {updateInfo.releaseNotes}
            </p>
            <button
              type="button"
              onClick={() => setShowUpdateModal(true)}
              className="w-full h-10 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B10D] text-[#181611] text-[13px] font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Download className="w-4 h-4" />
              {hi ? 'अभी इन-ऐप अपडेट करें' : 'Update App Now'}
            </button>
          </div>
        )}
      </section>

      {/* Security & Sign Out */}
      <div className="bg-[#FFF8D6] border border-[#EED77C] rounded-[14px] p-3.5 text-[12px] text-[#5C4100] flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
        <span>This app includes Volunteer field tools only. Coordinator review & analytics remain separated on M2S Admin Web.</span>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="w-full h-12 rounded-[12px] border border-[#F5C6C2] bg-[#FDECEA] text-[#B42318] text-[14px] font-bold inline-flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        {hi ? 'लॉग आउट करें' : 'Sign Out'}
      </button>

      <ConfirmDialog
        open={confirmForceLogout}
        title="Unsynced offline work!"
        description={`${pendingCount} offline survey or document item(s) have not synced to the server yet. Signing out now will discard unsynced device data.`}
        confirmLabel="Discard & Sign Out"
        variant="danger"
        onCancel={() => setConfirmForceLogout(false)}
        onConfirm={() => {
          setConfirmForceLogout(false);
          logout({ force: true }).catch(() => undefined);
        }}
      />

      <UpdateModal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        updateInfo={updateInfo}
        language={language}
      />
    </MobileLayout>
  );
};

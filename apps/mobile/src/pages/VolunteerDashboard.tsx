import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardPlus,
  Clock,
  Download,
  FileEdit,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { StatusBadge } from '@m2s/shared/components/StatusBadge';
import { evaluateSurveyQuality } from '@m2s/shared/utils/surveyQuality';
import { UpdateModal } from '@m2s/shared/components/UpdateModal';
import {
  fetchServerAppVersion,
  isUpdateAvailable,
  LOCAL_APP_VERSION,
  type AppVersionPayload,
} from '@m2s/shared/utils/appUpdate';
import { useMobileStore } from '../store/mobileStore';
import { SessionGpsBanner } from '@m2s/shared/components/SessionGpsBanner';
import { getApiOrigin, isNativeCapacitor } from '../api/http';
import { MobileLayout } from '../components/MobileLayout';

export const VolunteerDashboard: React.FC = () => {
  const {
    currentUser,
    clusters,
    surveys,
    documents,
    pendingCount,
    syncState,
    isOnline,
    isPendingSync,
    syncPendingSurveys,
    language,
    deviceGps,
    gpsState,
    refreshLocationPing,
  } = useMobileStore();
  const hi = language === 'hi';

  const stats = useMemo(() => {
    let approved = 0;
    let submitted = 0;
    let drafts = 0;
    let returned = 0;
    surveys.forEach((s) => {
      if (s.status === 'APPROVED') approved += 1;
      else if (s.status === 'SUBMITTED') submitted += 1;
      else if (s.status === 'RETURNED' || s.status === 'REJECTED') returned += 1;
      else drafts += 1;
    });
    return { approved, submitted, drafts, returned, total: surveys.length };
  }, [surveys]);

  const assignedClusters = useMemo(() => {
    const mine = clusters.filter((c) => currentUser.assignedClusterIds.includes(c.id) && c.active);
    return mine.length > 0 ? mine : clusters.filter((c) => c.active);
  }, [clusters, currentUser.assignedClusterIds]);

  const recentSurveys = useMemo(
    () => [...surveys].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [surveys]
  );

  const [updateInfo, setUpdateInfo] = useState<AppVersionPayload | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    // Only check for binary APK updates on native Android Capacitor
    if (!isNativeCapacitor()) return;

    let active = true;
    fetchServerAppVersion(getApiOrigin()).then((info) => {
      if (!active || !info) return;
      const updateReady = isUpdateAvailable(LOCAL_APP_VERSION, info);
      if (updateReady) {
        setUpdateInfo(info);
        setHasUpdate(true);
        const dismissed = localStorage.getItem(`m2s_dismissed_update_${info.versionCode}`);
        const downloaded = localStorage.getItem(`m2s_downloaded_update_${info.versionCode}`);
        if (!dismissed && !downloaded && !sessionStorage.getItem('m2s_update_prompted')) {
          sessionStorage.setItem('m2s_update_prompted', 'true');
          setShowUpdateModal(true);
        }
      }
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <MobileLayout title={hi ? 'डैशबोर्ड' : 'Volunteer Home'}>
      {/* Hero Banner */}
      <section className="rounded-[16px] bg-gradient-to-br from-[#FFE042] via-[#FDC513] to-[#ECC000] text-[#181611] p-4 space-y-3 shadow-sm border border-[#E5BC00]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11.5px] text-[#363127] font-semibold">
              {hi ? 'नमस्ते, फील्ड वालंटियर' : 'Welcome back, Field Volunteer'}
            </p>
            <h2 className="text-[19px] font-extrabold tracking-tight text-[#181611]">{currentUser.name}</h2>
            <p className="text-[12px] text-[#363127] mt-0.5 font-medium">
              {assignedClusters.length} {hi ? 'निर्धारित क्लस्टर' : 'assigned clusters'} · {stats.total}{' '}
              {hi ? 'परिवार रिकॉर्ड' : 'household records'}
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[#181611] text-[#FDC513] text-[11px] font-bold">M2S FIELD</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Link
            to="/surveys/new"
            className="h-11 rounded-[12px] bg-[#181611] hover:bg-[#2A261D] text-[#FDC513] font-bold text-[13.5px] inline-flex items-center justify-center gap-1.5 shadow-sm transition"
          >
            <ClipboardPlus className="w-4 h-4" />
            {hi ? 'नया सर्वे शुरू करें' : 'New Survey'}
          </Link>
          <Link
            to="/documents"
            className="h-11 rounded-[12px] bg-white/85 hover:bg-white text-[#181611] font-semibold text-[13.5px] inline-flex items-center justify-center gap-1.5 border border-[#181611]/15 transition"
          >
            <Camera className="w-4 h-4" />
            {hi ? 'दस्तावेज़ कैप्चर' : 'Capture Docs'}
          </Link>
        </div>
      </section>

      {/* Pending Sync Alert */}
      <SessionGpsBanner gpsState={gpsState} deviceGps={deviceGps} hi={hi} onRefresh={() => refreshLocationPing(true)} />

      {/* In-App Update Notice Banner */}
      {hasUpdate && updateInfo && (
        <section className="bg-gradient-to-r from-[#FFF8D6] via-[#FFF3BE] to-[#FFEAA1] border border-[#EED77C] rounded-[14px] p-3.5 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#FDC513] border border-[#D9AE00] text-[#181611] grid place-items-center shrink-0">
              <Sparkles className="w-5 h-5 text-[#8C6200]" />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-[#181611] truncate">
                {hi ? `नया अपडेट उपलब्ध है (${updateInfo.version})` : `New Update Ready (${updateInfo.version})`}
              </div>
              <p className="text-[11.5px] text-[#6E4F00] truncate">
                {hi ? 'सुधारों के लिए ऐप में ही अपडेट करें' : 'Tap to update directly inside app'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowUpdateModal(true)}
            className="h-9 px-3.5 rounded-[10px] bg-[#181611] text-[#FDC513] hover:bg-[#2A261D] text-[12.5px] font-bold inline-flex items-center gap-1 shrink-0 shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            {hi ? 'अपडेट करें' : 'Update'}
          </button>
        </section>
      )}

      {pendingCount > 0 && (
        <section className="rounded-[14px] bg-[#FFF8E6] border border-[#F6E19C] p-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-[#8A5B00]">
              {pendingCount} item{pendingCount > 1 ? 's' : ''} queued for sync
            </div>
            <p className="text-[12px] text-[#6E4900]">
              {isOnline ? 'Tap Sync Now to upload to M2S server.' : 'Saved safely on device. Will auto-sync online.'}
            </p>
          </div>
          <button
            type="button"
            disabled={!isOnline || syncState.running}
            onClick={() => syncPendingSurveys()}
            className="h-9 px-3 rounded-[10px] bg-[#D97706] disabled:opacity-50 text-white text-[12px] font-bold inline-flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncState.running ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </section>
      )}

      {/* KPI Tiles */}
      <section className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2.5">
        <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#FFF5C0] text-[#8C6200] grid place-items-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </span>
          <div>
            <div className="text-[20px] font-extrabold text-[#181611] leading-none">{stats.approved}</div>
            <div className="text-[11.5px] text-[#625C4E] mt-1">{hi ? 'स्वीकृत सर्वे' : 'Approved'}</div>
          </div>
        </div>

        <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#E6EEF9] text-[#2D5E9E] grid place-items-center shrink-0">
            <Clock className="w-5 h-5" />
          </span>
          <div>
            <div className="text-[20px] font-extrabold text-[#181611] leading-none">{stats.submitted}</div>
            <div className="text-[11.5px] text-[#625C4E] mt-1">{hi ? 'समीक्षाधीन' : 'In Review'}</div>
          </div>
        </div>

        <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#F0EDE2] text-[#4A4538] grid place-items-center shrink-0">
            <FileEdit className="w-5 h-5" />
          </span>
          <div>
            <div className="text-[20px] font-extrabold text-[#181611] leading-none">{stats.drafts}</div>
            <div className="text-[11.5px] text-[#625C4E] mt-1">{hi ? 'ड्राफ़्ट' : 'Drafts'}</div>
          </div>
        </div>

        <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#FDE8D8] text-[#A1460B] grid place-items-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div>
            <div className="text-[20px] font-extrabold text-[#181611] leading-none">{stats.returned}</div>
            <div className="text-[11.5px] text-[#625C4E] mt-1">{hi ? 'सुधार हेतु वापस' : 'Returned'}</div>
          </div>
        </div>
      </section>

      {/* Recent Surveys */}
      <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14.5px] font-bold text-[#181611]">
            {hi ? 'हाल के पारिवारिक सर्वे' : 'Recent Household Surveys'}
          </h3>
          <Link to="/surveys" className="text-[12px] font-semibold text-[#8C6200] inline-flex items-center gap-0.5">
            See all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentSurveys.length === 0 ? (
          <p className="text-[12.5px] text-[#625C4E] py-2">
            No surveys recorded yet. Tap "New Survey" above to begin fieldwork.
          </p>
        ) : (
          <div className="divide-y divide-[#F2EEE2]">
            {recentSurveys.map((s) => {
              const q = evaluateSurveyQuality({
                survey: s,
                documents: documents.filter((d) => d.householdId === s.householdId),
                peerSurveys: surveys,
              });
              const pending = isPendingSync(s.id);
              return (
                <Link
                  key={s.id}
                  to={`/surveys/${s.id}`}
                  className="py-2.5 flex items-center justify-between gap-2 hover:bg-[#FAF8F2] rounded-lg px-1 -mx-1"
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-[#181611] truncate">
                      {s.profile.headName || 'Unnamed Household'}
                    </div>
                    <div className="text-[12px] text-[#625C4E] truncate">
                      {s.surveyCode || 'New Draft'} · {s.clusterName || 'No cluster'} · {q.completenessScore}% complete
                    </div>
                  </div>
                  <StatusBadge status={pending ? 'PENDING_SYNC' : s.status} />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <UpdateModal
        open={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        updateInfo={updateInfo}
        language={language}
      />
    </MobileLayout>
  );
};

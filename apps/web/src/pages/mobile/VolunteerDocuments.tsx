import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Plus, ShieldAlert } from 'lucide-react';
import { VolunteerLayout } from '../../components/layout/VolunteerLayout';
import { HouseholdDocuments } from '../../components/survey/HouseholdDocuments';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAppStore } from '../../store/appStore';
import { parseDocVerifiedCodes } from '../../components/survey/surveyModel';

export const VolunteerDocuments: React.FC = () => {
  const { householdId } = useParams<{ householdId?: string }>();
  const navigate = useNavigate();
  const { surveys, documents, currentUser, language } = useAppStore();

  const sortedSurveys = useMemo(
    () => [...surveys].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [surveys]
  );

  const [selectedHouseholdId, setSelectedHouseholdId] = useState(
    householdId || sortedSurveys[0]?.householdId || ''
  );

  useEffect(() => {
    if (householdId) {
      setSelectedHouseholdId(householdId);
      return;
    }
    if (!selectedHouseholdId && sortedSurveys[0]) {
      setSelectedHouseholdId(sortedSurveys[0].householdId);
    }
  }, [householdId, selectedHouseholdId, sortedSurveys]);

  const activeSurvey = useMemo(
    () => sortedSurveys.find((s) => s.householdId === selectedHouseholdId) ?? sortedSurveys[0],
    [sortedSurveys, selectedHouseholdId]
  );

  const docCount = useMemo(
    () => (activeSurvey ? documents.filter((d) => d.householdId === activeSurvey.householdId).length : 0),
    [documents, activeSurvey]
  );

  const canUpload = Boolean(
    activeSurvey &&
      (currentUser.role === 'SUPER_ADMIN' ||
        currentUser.role === 'ADMIN' ||
        (activeSurvey.volunteerId === currentUser.id &&
          (activeSurvey.status === 'DRAFT' ||
            activeSurvey.status === 'PENDING_SYNC' ||
            activeSurvey.status === 'RETURNED')))
  );

  return (
    <VolunteerLayout>
      {/* Header */}
      <div className="bg-white border-b border-[#E7E2D4] px-4 py-3.5 sticky top-0 z-20 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="min-w-[40px] min-h-[40px] rounded-xl hover:bg-[#FAF8F2] flex items-center justify-center text-[#181611] shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-[#181611] truncate">Household Documents</h1>
              <p className="text-[11px] text-[#726C5D] truncate">Private encrypted capture & verification</p>
            </div>
          </div>
        </div>

        {/* Household Selector */}
        {sortedSurveys.length > 0 && (
          <div>
            <label className="sr-only" htmlFor="doc-household-select">
              Select Household
            </label>
            <select
              id="doc-household-select"
              value={activeSurvey?.householdId ?? ''}
              onChange={(e) => setSelectedHouseholdId(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-[#E7E2D4] bg-[#FAF8F2] px-3 text-xs font-semibold text-[#181611]"
            >
              {sortedSurveys.map((s) => (
                <option key={s.householdId} value={s.householdId}>
                  {s.surveyCode || 'Draft (unsynced)'} — {s.profile.headName || 'New Household'} ({s.clusterName || 'No cluster'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4 flex-1">
        {!activeSurvey ? (
          <EmptyState
            title="No households available yet"
            description="Start a new household survey first, then capture Aadhaar (last 4 digits), Ration Card, Touzi / Patta, or Family Photo."
            action={
              <button
                type="button"
                onClick={() => navigate('/volunteer/surveys/new')}
                className="min-h-[44px] px-4 rounded-xl bg-[#FDC513] text-[#181611] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Start New Survey
              </button>
            }
          />
        ) : (
          <>
            {/* Household Context Card */}
            <div className="bg-[#FDC513] text-[#181611] rounded-2xl p-4 shadow-card space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#181611]/75">Household Survey ID</span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#181611] text-[#FDC513] text-xs font-bold">
                  {activeSurvey.surveyCode || 'Unsynced draft'}
                </span>
              </div>
              <div className="text-base font-bold">{activeSurvey.profile.headName || 'Household Head'}</div>
              <div className="flex items-center justify-between text-xs text-[#181611]/85 gap-2 flex-wrap">
                <span>Cluster / Village: {activeSurvey.clusterName || '—'}</span>
                <span>{docCount} Document(s)</span>
              </div>
            </div>

            {/* Privacy Warning Banner */}
            <div className="rounded-2xl bg-[#FEF9E7] border border-[#F4C928]/50 p-3.5 flex items-start gap-2.5 text-xs text-[#7D5900]">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#9A6E00]" />
              <div>
                <strong>Privacy Protocol:</strong> Confirm household consent before photographing IDs.
                Never type or store a full 12-digit Aadhaar number — only last 4 digits are accepted.
              </div>
            </div>

            {!canUpload && (
              <p className="rounded-xl bg-[#FAF8F2] border border-[#E7E2D4] px-3.5 py-2.5 text-xs text-[#5C5547]">
                This survey is <strong>{activeSurvey.status.toLowerCase()}</strong>; existing documents are shown below in read-only mode.
              </p>
            )}

            <HouseholdDocuments
              householdId={activeSurvey.householdId}
              language={language}
              canUpload={canUpload}
              b3Codes={parseDocVerifiedCodes(activeSurvey.profile.docVerifiedCode)}
              defaultLast4={activeSurvey.profile.idLast4}
            />

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate(`/volunteer/surveys/${activeSurvey.id}`)}
                className="w-full min-h-[50px] rounded-xl bg-[#181611] hover:bg-[#2C281F] text-[#FDC513] font-bold text-sm inline-flex items-center justify-center gap-2 transition"
              >
                Continue to Survey Review
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </VolunteerLayout>
  );
};

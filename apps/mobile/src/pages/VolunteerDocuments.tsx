import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { DocumentCard } from '@m2s/shared/components/DocumentCard';
import { EmptyState } from '@m2s/shared/components/EmptyState';
import type { HouseholdDocument } from '@m2s/shared/types/survey';
import { useMobileStore } from '../store/mobileStore';
import { MobileDocumentPreview } from '../components/MobileDocumentPreview';
import { MobileHouseholdDocuments } from '../components/MobileHouseholdDocuments';
import { MobileLayout } from '../components/MobileLayout';

export const VolunteerDocuments: React.FC = () => {
  const { householdId } = useParams<{ householdId: string }>();
  const navigate = useNavigate();
  const { surveys, documents, removeDocument, syncPendingSurveys, language } = useMobileStore();
  const hi = language === 'hi';

  const [selectedHhId, setSelectedHhId] = useState<string>(() => householdId || surveys[0]?.householdId || '');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'LOCAL_ONLY'>('ALL');
  const [previewDoc, setPreviewDoc] = useState<HouseholdDocument | null>(null);

  const activeHhId = householdId || selectedHhId || surveys[0]?.householdId || '';

  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      if (filter === 'LOCAL_ONLY') return d.uploadStatus === 'LOCAL_ONLY' || d.uploadStatus === 'UPLOAD_FAILED';
      if (filter === 'PENDING') return d.verificationStatus === 'PENDING' && d.uploadStatus === 'UPLOADED';
      if (filter === 'VERIFIED') return d.verificationStatus === 'VERIFIED';
      if (filter === 'REJECTED') return d.verificationStatus === 'REJECTED';
      return true;
    });
  }, [documents, filter]);

  return (
    <MobileLayout title={hi ? 'दस्तावेज़ कैप्चर' : 'Household Documents'} backTo={householdId ? '/surveys' : undefined}>
      {/* Household Selector */}
      <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 space-y-2">
        <label htmlFor="doc-hh-select" className="block text-[12.5px] font-bold text-[#181611]">
          Select Household for Camera / PDF Capture
        </label>
        {surveys.length === 0 ? (
          <div className="text-[12.5px] text-[#5C5547]">
            Create a household survey draft first before attaching documents.{' '}
            <Link to="/surveys/new" className="font-semibold text-[#8C6200] underline">
              Start Survey
            </Link>
          </div>
        ) : (
          <select
            id="doc-hh-select"
            value={activeHhId}
            onChange={(e) => {
              setSelectedHhId(e.target.value);
              if (householdId) navigate(`/documents/${e.target.value}`);
            }}
            className="w-full h-11 rounded-[10px] border border-[#DFD9C8] bg-white px-3 text-[13.5px] font-medium"
          >
            {surveys.map((s) => (
              <option key={s.householdId} value={s.householdId}>
                {s.surveyCode || 'Draft'} — {s.profile.headName || 'Unnamed Household'} ({s.clusterName || 'Cluster'})
              </option>
            ))}
          </select>
        )}
      </div>

      {activeHhId && <MobileHouseholdDocuments householdId={activeHhId} />}

      {/* All Documents Queue / Status */}
      <section className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[14.5px] font-bold text-[#181611]">Uploaded & Queued Documents ({filteredDocs.length})</h3>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'ALL', label: 'All' },
            { key: 'LOCAL_ONLY', label: 'Queued / Failed' },
            { key: 'PENDING', label: 'Pending Review' },
            { key: 'VERIFIED', label: 'Verified' },
            { key: 'REJECTED', label: 'Returned' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key as typeof filter)}
              className={`h-8 px-3 rounded-full text-[12px] font-semibold border whitespace-nowrap ${
                filter === f.key ? 'bg-[#181611] text-[#FDC513] border-[#181611]' : 'bg-white text-[#5C5547] border-[#DFD9C8]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredDocs.length === 0 ? (
          <EmptyState
            icon={<Camera className="w-5 h-5" />}
            title="No documents in this view"
            description="Select a household above and capture a photo or PDF."
          />
        ) : (
          <div className="space-y-2.5">
            {filteredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                layout="row"
                onPreview={setPreviewDoc}
                onRetryUpload={() => {
                  syncPendingSurveys().catch(() => undefined);
                }}
                onRemove={(d) => removeDocument(d.id).catch(() => undefined)}
              />
            ))}
          </div>
        )}
      </section>

      <MobileDocumentPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </MobileLayout>
  );
};

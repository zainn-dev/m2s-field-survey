import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CheckSquare, ShieldAlert, Square } from 'lucide-react';
import { B3_CODE_TO_CATEGORY_ID } from '@m2s/shared/survey/surveyModel';
import type { HouseholdDocument } from '@m2s/shared/types/survey';
import { DocumentCard } from '@m2s/shared/components/DocumentCard';
import { Last4Input } from '@m2s/shared/components/Last4Input';
import { useMobileStore } from '../store/mobileStore';
import { MobileCaptureDropzone } from './MobileCaptureDropzone';
import { MobileDocumentPreview } from './MobileDocumentPreview';

interface MobileHouseholdDocumentsProps {
  householdId: string;
  disabled?: boolean;
  /** B3 selected codes (e.g. ['1', '3']) to highlight and prioritize categories for capture. */
  b3Codes?: string[];
  /** Default last-4 digits captured in B3. */
  defaultLast4?: string;
}

export const MobileHouseholdDocuments: React.FC<MobileHouseholdDocumentsProps> = ({
  householdId,
  disabled,
  b3Codes = [],
  defaultLast4 = '',
}) => {
  const { documents, docCategories, uploadDocument, removeDocument, syncPendingSurveys } = useMobileStore();
  const hhDocs = useMemo(() => documents.filter((d) => d.householdId === householdId), [documents, householdId]);
  const uploadedCatIds = useMemo(() => new Set(hhDocs.map((d) => d.categoryId)), [hhDocs]);

  const b3CategoryIds = useMemo(
    () => new Set(b3Codes.map((c) => B3_CODE_TO_CATEGORY_ID[c]).filter(Boolean)),
    [b3Codes]
  );

  const [selectedCatIds, setSelectedCatIds] = useState<string[]>(() => {
    const pendingB3 = [...b3CategoryIds].filter(
      (id) => docCategories.some((c) => c.id === id) && !uploadedCatIds.has(id)
    );
    if (pendingB3.length > 0) return pendingB3;
    if (b3CategoryIds.size > 0) return [...b3CategoryIds].filter((id) => docCategories.some((c) => c.id === id));
    return docCategories[0]?.id ? [docCategories[0].id] : [];
  });

  const [aadhaarLast4, setAadhaarLast4] = useState(defaultLast4);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewDoc, setPreviewDoc] = useState<HouseholdDocument | null>(null);

  useEffect(() => {
    if (defaultLast4 && !aadhaarLast4) setAadhaarLast4(defaultLast4);
  }, [defaultLast4, aadhaarLast4]);

  const toggleCategory = (id: string) => {
    setSelectedCatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedCatIds(docCategories.map((c) => c.id));
  };

  const selectB3Only = () => {
    const b3Cats = docCategories.filter((c) => b3CategoryIds.has(c.id)).map((c) => c.id);
    setSelectedCatIds(b3Cats);
  };

  const clearSelection = () => {
    setSelectedCatIds([]);
  };

  const activeCats = useMemo(
    () => docCategories.filter((c) => selectedCatIds.includes(c.id)),
    [docCategories, selectedCatIds]
  );

  const isAadhaarCat = activeCats.some(
    (c) => c.requiresLast4 || /aadhaar/i.test(c.label)
  );

  const labelSummary = useMemo(() => {
    if (activeCats.length === 0) return '';
    if (activeCats.length === 1) return activeCats[0].label;
    if (activeCats.length === 2) return `${activeCats[0].label} & ${activeCats[1].label}`;
    return `${activeCats[0].label}, ${activeCats[1].label} (+${activeCats.length - 2} more)`;
  }, [activeCats]);

  const handleUpload = async (files: File[]) => {
    if (activeCats.length === 0) return;
    if (isAadhaarCat && aadhaarLast4 && aadhaarLast4.length !== 4) {
      throw new Error('Enter all 4 digits of Aadhaar last-4 (or leave blank). Full Aadhaar numbers are never stored.');
    }
    setUploading(true);
    setProgress(5);
    try {
      for (let i = 0; i < activeCats.length; i++) {
        const cat = activeCats[i];
        const isAadhaar = Boolean(cat.requiresLast4 || /aadhaar/i.test(cat.label));
        await uploadDocument(
          {
            householdId,
            categoryId: cat.id,
            docType: cat.label,
            aadhaarLast4: isAadhaar ? aadhaarLast4 || undefined : undefined,
            files,
          },
          (pct) => {
            const base = (i / activeCats.length) * 100;
            const inc = pct / activeCats.length;
            setProgress(Math.round(base + inc));
          }
        );
      }
      setAadhaarLast4(defaultLast4);
      // Remove uploaded categories from selection
      const uploadedNow = new Set(activeCats.map((c) => c.id));
      setSelectedCatIds((prev) => prev.filter((id) => !uploadedNow.has(id)));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Checklist chips */}
      <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[14px] font-bold text-[#181611]">Document Checklist</h3>
            <p className="text-[11.5px] text-[#5C5547]">
              Tick multiple documents to attach and upload together
            </p>
          </div>
          <span className="text-[12px] font-semibold text-[#8C6200] shrink-0">{hhDocs.length} attached</span>
        </div>

        <div className="flex items-center gap-2 pt-1 pb-0.5">
          <button
            type="button"
            onClick={selectAll}
            className="text-[11.5px] font-bold text-[#8C6200] hover:underline"
          >
            Select All
          </button>
          {b3CategoryIds.size > 0 && (
            <>
              <span className="text-[#D7D1C2]">•</span>
              <button
                type="button"
                onClick={selectB3Only}
                className="text-[11.5px] font-bold text-[#8C6200] hover:underline"
              >
                Select B3 ({b3CategoryIds.size})
              </button>
            </>
          )}
          <span className="text-[#D7D1C2]">•</span>
          <button
            type="button"
            onClick={clearSelection}
            className="text-[11.5px] font-semibold text-[#726C5D] hover:underline"
          >
            Clear
          </button>
          <span className="ml-auto text-[11px] font-bold text-[#181611] bg-[#FFF5C4] border border-[#D9AE00] px-2 py-0.5 rounded-full">
            {selectedCatIds.length} selected
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {docCategories.map((cat) => {
            const done = uploadedCatIds.has(cat.id);
            const selected = selectedCatIds.includes(cat.id);
            const inB3 = b3CategoryIds.has(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                className={`px-2.5 py-1.5 rounded-[10px] text-[12px] font-semibold border inline-flex items-center gap-1.5 transition ${
                  selected
                    ? 'bg-[#181611] text-[#FDC513] border-[#181611]'
                    : done
                    ? 'bg-[#FFF8D6] text-[#5C4100] border-[#EED77C]'
                    : inB3
                    ? 'bg-[#FFFDF4] text-[#8C6200] border-[#D9AE00]'
                    : 'bg-white text-[#4A4336] border-[#DFD9C8]'
                }`}
              >
                {selected ? (
                  <CheckSquare className="w-3.5 h-3.5 shrink-0 text-[#FDC513]" />
                ) : done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <Square className="w-3.5 h-3.5 opacity-50 shrink-0" />
                )}
                <span>
                  {cat.label}
                  {cat.requiredForSubmission ? ' *' : ''}
                </span>
                {done && (
                  <span className="text-[10px] text-emerald-700 font-bold">
                    ✓
                  </span>
                )}
                {inB3 && !done && (
                  <span
                    className={`px-1 rounded text-[10px] font-bold ${
                      selected ? 'bg-[#FDC513] text-[#181611]' : 'bg-[#FFF8D6] text-[#8C6200]'
                    }`}
                  >
                    B3
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Category Capture */}
      {!disabled && (
        <div className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 space-y-3">
          {activeCats.length === 0 ? (
            <div className="text-center py-6 px-4 bg-[#FAF8F2] rounded-[10px] border border-dashed border-[#DFD9C8]">
              <p className="text-[13.5px] font-bold text-[#181611] mb-1">
                Tick one or more document categories above
              </p>
              <p className="text-[12px] text-[#726C5D]">
                Select the categories you want to attach photos or files to, then capture them below.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-[#FFFDF4] border border-[#F6E19C] rounded-[10px] p-2.5 flex items-start justify-between gap-2 text-[12px]">
                <div>
                  <span className="font-bold text-[#8C6200]">Selected for upload ({activeCats.length}):</span>{' '}
                  <span className="text-[#181611] font-semibold">{labelSummary}</span>
                </div>
              </div>

              {isAadhaarCat && (
                <div className="space-y-2">
                  <div className="rounded-[10px] bg-[#FFF8E6] border border-[#F6E19C] px-3 py-2 text-[12px] text-[#6E4900] flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Only enter the last 4 digits of Aadhaar. Mask full Aadhaar numbers if capturing on camera.</span>
                  </div>
                  <Last4Input
                    id={`mobile-aadhaar-${householdId}`}
                    value={aadhaarLast4}
                    onChange={setAadhaarLast4}
                    disabled={uploading}
                  />
                </div>
              )}

              <MobileCaptureDropzone
                docLabel={labelSummary}
                disabled={disabled}
                uploading={uploading}
                uploadProgress={progress}
                onUpload={handleUpload}
              />
            </>
          )}
        </div>
      )}

      {/* Existing & Queued Household Documents */}
      <div className="space-y-2.5">
        {hhDocs.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            layout="row"
            onPreview={setPreviewDoc}
            onRetryUpload={() => {
              syncPendingSurveys().catch(() => undefined);
            }}
            onRemove={disabled ? undefined : (d) => removeDocument(d.id).catch(() => undefined)}
          />
        ))}
      </div>

      <MobileDocumentPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CheckSquare, Circle, CloudOff, FileText, Loader2, Plus, ShieldCheck, Square, Trash2, Upload, X, XCircle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { HouseholdDocument, Language } from '../../types/survey';
import { UploadDropzone } from '../ui/UploadDropzone';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { B3_CODE_TO_CATEGORY_ID, isPdfPage } from './surveyModel';

/* ------------------------------------------------------------------ */
/* Last-4 input: never accepts (or truncates) a longer ID number       */
/* ------------------------------------------------------------------ */

export const Last4Input: React.FC<{
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  required?: boolean;
  label?: string;
}> = ({ id, value, onChange, disabled, required, label = 'Aadhaar: last 4 digits only' }) => {
  const [error, setError] = useState('');
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-[#181611] mb-1">
        {label} {required && <span className="text-[#C93B32]">*</span>}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          // A pasted full number must be rejected, not silently cut to its FIRST four digits.
          if (digits.length > 4) {
            setError('Enter only the last 4 digits. Full Aadhaar numbers are never recorded.');
            return;
          }
          setError('');
          onChange(digits);
        }}
        placeholder="e.g. 4821"
        aria-invalid={!!error}
        className="w-full h-11 rounded-[10px] border border-[#E7E2D4] bg-white px-3 text-[15px] font-mono tracking-[0.3em] text-[#181611] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2]"
      />
      <p className={`text-[12px] mt-1 ${error ? 'text-[#C93B32] font-semibold' : 'text-[#726C5D]'}`}>
        {error || 'Never type the full 12-digit number.'}
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Status pills                                                        */
/* ------------------------------------------------------------------ */

const Pill: React.FC<{ tone: 'green' | 'amber' | 'red' | 'blue' | 'grey'; icon?: React.ReactNode; children: React.ReactNode }> = ({
  tone,
  icon,
  children,
}) => {
  const cls = {
    green: 'bg-[#FFF8D6] text-[#8C6200] border-[#F5E493]',
    amber: 'bg-[#FFF5E0] text-[#9A6800] border-[#F6E19C]',
    red: 'bg-[#FDECEA] text-[#C93B32] border-[#F5C6C2]',
    blue: 'bg-[#EAF1FB] text-[#2D69B3] border-[#D6E4F7]',
    grey: 'bg-[#EFECE2] text-[#5C5547] border-[#DFD9C8]',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11.5px] font-semibold whitespace-nowrap ${cls}`}>
      {icon}
      {children}
    </span>
  );
};

const isQueued = (d: HouseholdDocument) => d.uploadStatus === 'LOCAL_ONLY' || d.uploadStatus === 'UPLOAD_FAILED';

/* ------------------------------------------------------------------ */
/* One existing document                                               */
/* ------------------------------------------------------------------ */

const DocumentItem: React.FC<{
  doc: HouseholdDocument;
  categoryLabel: string;
  canDelete: boolean;
  onDelete: () => void;
  pageUrl: (i: number, mode: 'inline' | 'view') => string;
}> = ({ doc, categoryLabel, canDelete, onDelete, pageUrl }) => {
  const shown = doc.pages.slice(0, 4);
  const more = doc.pages.length - shown.length;
  return (
    <li className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14.5px] font-semibold text-[#181611] truncate">{doc.docType || categoryLabel}</div>
          <div className="text-[12.5px] text-[#726C5D] truncate">
            {categoryLabel !== doc.docType && `${categoryLabel} · `}
            {doc.pages.length} {doc.pages.length === 1 ? 'page' : 'pages'}
            {doc.aadhaarLast4 && <span className="font-mono"> · •••• {doc.aadhaarLast4}</span>}
            {' · '}
            {new Date(doc.uploadedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </div>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${doc.docType}`}
            className="w-10 h-10 shrink-0 rounded-[10px] border border-[#F5C6C2] text-[#C93B32] hover:bg-[#FDECEA] inline-flex items-center justify-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {isQueued(doc) ? (
          <Pill tone="amber" icon={<CloudOff className="w-3 h-3" />}>
            Waiting to sync
          </Pill>
        ) : doc.uploadStatus === 'UPLOADING' ? (
          <Pill tone="blue" icon={<Loader2 className="w-3 h-3 animate-spin" />}>
            Uploading {doc.uploadProgress}%
          </Pill>
        ) : doc.verificationStatus === 'VERIFIED' ? (
          <Pill tone="green" icon={<CheckCircle2 className="w-3 h-3" />}>
            Verified
          </Pill>
        ) : doc.verificationStatus === 'REJECTED' ? (
          <Pill tone="red" icon={<XCircle className="w-3 h-3" />}>
            Rejected
          </Pill>
        ) : (
          <Pill tone="amber">Pending verification</Pill>
        )}
      </div>

      {doc.uploadStatus === 'UPLOAD_FAILED' && (
        <p className="text-[12px] text-[#9A6800]">
          Last upload attempt failed{doc.rejectionReason ? `: ${doc.rejectionReason}` : ''}. It will be retried automatically.
        </p>
      )}
      {doc.verificationStatus === 'REJECTED' && !isQueued(doc) && (
        <p className="rounded-[10px] bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[12.5px] text-[#A3312A]">
          <strong>Reason:</strong> {doc.rejectionReason || 'No reason given.'} Capture a clearer copy and delete this one.
        </p>
      )}

      {shown.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {shown.map((p, i) => (
            <a
              key={p.id}
              href={pageUrl(i, 'view')}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open page ${i + 1}`}
              className="relative aspect-[3/4] rounded-lg border border-[#E7E2D4] bg-[#FAF8F2] overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-[#FDC513]/40"
            >
              {isPdfPage(p) ? (
                <span className="flex flex-col items-center gap-0.5 text-[#8C6200]">
                  <FileText className="w-7 h-7" />
                  <span className="text-[10px] font-semibold">PDF</span>
                </span>
              ) : (
                <img src={pageUrl(i, 'inline')} alt={`Page ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
              )}
              {i === shown.length - 1 && more > 0 && (
                <span className="absolute inset-0 bg-[#181611]/70 text-[#FDC513] text-[13px] font-bold flex items-center justify-center">
                  +{more}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </li>
  );
};

/* ------------------------------------------------------------------ */
/* Capture form + list for one household                               */
/* ------------------------------------------------------------------ */

interface HouseholdDocumentsProps {
  householdId: string;
  language?: Language;
  /** False hides the capture form (e.g. read-only survey). Existing documents are still listed. */
  canUpload?: boolean;
  /** Runs before each upload (the wizard uses it to make sure the household exists on the server or in the queue). */
  beforeUpload?: () => Promise<void>;
  /** Selected B3 codes (e.g. ['1', '3']) to highlight and prioritize categories for capture. */
  b3Codes?: string[];
  /** Pre-filled last 4 digits (from B3). */
  defaultLast4?: string;
}

export const HouseholdDocuments: React.FC<HouseholdDocumentsProps> = ({
  householdId,
  language = 'en',
  canUpload = true,
  beforeUpload,
  b3Codes = [],
  defaultLast4 = '',
}) => {
  const { documents, docCategories, currentUser, uploadDocument, removeDocument, documentPageUrl, notify, isOnline } = useAppStore();
  const hi = language === 'hi';

  const categories = useMemo(() => docCategories.filter((c) => c.enabled), [docCategories]);
  const docs = useMemo(
    () =>
      documents
        .filter((d) => d.householdId === householdId)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
    [documents, householdId]
  );

  const uploadedCatIds = useMemo(() => new Set(docs.map((d) => d.categoryId)), [docs]);
  const b3CategoryIds = useMemo(
    () => new Set(b3Codes.map((c) => B3_CODE_TO_CATEGORY_ID[c]).filter(Boolean)),
    [b3Codes]
  );

  const [formOpen, setFormOpen] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [docType, setDocType] = useState('');
  const [last4, setLast4] = useState(defaultLast4);
  const prevDefaultLast4 = useRef(defaultLast4);
  const [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [toDelete, setToDelete] = useState<HouseholdDocument | null>(null);

  const selectedCategories = useMemo(
    () => categories.filter((c) => selectedCategoryIds.includes(c.id)),
    [categories, selectedCategoryIds]
  );
  const anyRequiresLast4 = selectedCategories.some((c) => c.requiresLast4 || /aadhaar/i.test(c.label));
  const busy = progress !== null;

  useEffect(() => {
    if (defaultLast4 !== prevDefaultLast4.current) {
      if (last4 === prevDefaultLast4.current || !last4) setLast4(defaultLast4);
      prevDefaultLast4.current = defaultLast4;
    }
  }, [defaultLast4, last4]);

  useEffect(() => {
    if (!categories.length) return;
    if (selectedCategoryIds.length > 0 && selectedCategoryIds.some((id) => categories.some((c) => c.id === id))) return;
    const firstPendingB3 = [...b3CategoryIds].find(
      (id) => categories.some((c) => c.id === id) && !uploadedCatIds.has(id)
    );
    setSelectedCategoryIds(firstPendingB3 ? [firstPendingB3] : [categories[0].id]);
  }, [categories, selectedCategoryIds, b3CategoryIds, uploadedCatIds]);

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedCategoryIds(categories.map((c) => c.id));
  };

  const clearSelection = () => {
    setSelectedCategoryIds([]);
  };

  const reset = () => {
    setDocType('');
    setLast4(defaultLast4);
    setConsent(false);
    setFiles([]);
    setFormError('');
    setProgress(null);
  };

  const upload = async () => {
    setFormError('');
    if (selectedCategories.length === 0) return setFormError(hi ? 'कम से कम एक दस्तावेज़ श्रेणी चुनें।' : 'Choose at least one document category.');
    if (anyRequiresLast4 && !/^\d{4}$/.test(last4)) return setFormError(hi ? 'आधार दस्तावेज़ के अंतिम 4 अंक आवश्यक हैं।' : 'Aadhaar requires the last 4 digits.');
    if (!consent) return setFormError(hi ? 'पुष्टि करें कि परिवार ने इस दस्तावेज़ की सहमति दी है।' : 'Confirm that the household consented to this document being recorded.');
    if (files.length === 0) return setFormError(hi ? 'कम से कम एक पेज / फ़ाइल जोड़ें।' : 'Add at least one page.');

    setProgress(0);
    try {
      await beforeUpload?.();
      for (let i = 0; i < selectedCategories.length; i++) {
        const cat = selectedCategories[i];
        const isAadhaar = cat.requiresLast4 || /aadhaar/i.test(cat.label);
        const doc = await uploadDocument(
          {
            householdId,
            categoryId: cat.id,
            docType: docType.trim() || cat.label,
            aadhaarLast4: isAadhaar ? last4 : undefined,
            files,
          },
          (pct) => {
            const base = (i / selectedCategories.length) * 100;
            const inc = pct / selectedCategories.length;
            setProgress(Math.round(base + inc));
          }
        );
        if (i === selectedCategories.length - 1) {
          notify(isQueued(doc) ? 'Saved on device. The document will upload when you are back online.' : 'Document(s) uploaded successfully.');
        }
      }
      reset();
      // Remove uploaded categories
      const uploadedNow = new Set(selectedCategories.map((c) => c.id));
      setSelectedCategoryIds((prev) => prev.filter((id) => !uploadedNow.has(id)));
      setFormOpen(false);
    } catch {
      // The store has already shown the error; keep the form so the volunteer can retry.
      setProgress(null);
    }
  };

  const pageUrl = (doc: HouseholdDocument) => (i: number, mode: 'inline' | 'view') => documentPageUrl(doc, i, mode);
  const labelFor = (id: string) => {
    const c = docCategories.find((x) => x.id === id);
    return c ? (hi ? c.labelHi || c.label : c.label) : 'Document';
  };

  const showForm = canUpload && (formOpen || docs.length === 0);

  return (
    <div className="space-y-4">
      {canUpload && categories.length > 0 && (
        <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[13.5px] font-bold text-[#181611]">
                {hi ? 'दस्तावेज़ चेकलिस्ट (टिक करके फ़ोटो लें)' : 'Document Checklist (multi-select to capture)'}
              </h3>
              <p className="text-[11.5px] text-[#5C5547]">
                {hi ? 'एक या एकाधिक दस्तावेज़ चुनें और साथ में अपलोड करें' : 'Select one or multiple document categories to upload together'}
              </p>
            </div>
            <span className="text-[12px] font-semibold text-[#8C6200] shrink-0">
              {docs.length} {hi ? 'संलग्न' : 'attached'}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1 pb-0.5">
            <button
              type="button"
              disabled={busy}
              onClick={selectAll}
              className="text-[11.5px] font-bold text-[#8C6200] hover:underline"
            >
              {hi ? 'सभी चुनें' : 'Select All'}
            </button>
            {b3CategoryIds.size > 0 && (
              <>
                <span className="text-[#D7D1C2]">•</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const b3Cats = categories.filter((c) => b3CategoryIds.has(c.id)).map((c) => c.id);
                    setSelectedCategoryIds(b3Cats);
                  }}
                  className="text-[11.5px] font-bold text-[#8C6200] hover:underline"
                >
                  {hi ? `B3 केवल (${b3CategoryIds.size})` : `Select B3 (${b3CategoryIds.size})`}
                </button>
              </>
            )}
            <span className="text-[#D7D1C2]">•</span>
            <button
              type="button"
              disabled={busy}
              onClick={clearSelection}
              className="text-[11.5px] font-semibold text-[#726C5D] hover:underline"
            >
              {hi ? 'हटाएं' : 'Clear'}
            </button>
            <span className="ml-auto text-[11px] font-bold text-[#181611] bg-[#FFF5C4] border border-[#D9AE00] px-2 py-0.5 rounded-full">
              {selectedCategoryIds.length} {hi ? 'चुने गए' : 'selected'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const done = uploadedCatIds.has(c.id);
              const selected = selectedCategoryIds.includes(c.id);
              const inB3 = b3CategoryIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    toggleCategory(c.id);
                    setFormOpen(true);
                  }}
                  className={`px-2.5 py-1.5 rounded-[10px] text-[12px] font-semibold border inline-flex items-center gap-1.5 transition disabled:opacity-60 ${
                    selected
                      ? 'bg-[#181611] text-[#FDC513] border-[#181611]'
                      : done
                      ? 'bg-[#FFF8D6] text-[#5C4100] border-[#EED77C]'
                      : inB3
                      ? 'bg-[#FFFDF4] text-[#8C6200] border-[#D9AE00] hover:bg-[#FFF8D6]'
                      : 'bg-white text-[#4A4336] border-[#DFD9C8] hover:border-[#D9AE00]'
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
                    {hi ? c.labelHi || c.label : c.label}
                    {c.requiredForSubmission ? ' *' : ''}
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
        </section>
      )}

      {showForm && (
        <section className="bg-white rounded-[14px] border border-[#E7E2D4] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-[15px] font-semibold text-[#181611]">
                {hi ? 'दस्तावेज़ जोड़ें' : 'Upload Documents'}
              </h3>
              <p className="text-[12px] text-[#726C5D]">
                {selectedCategories.length === 0
                  ? (hi ? 'नीचे से दस्तावेज़ श्रेणी चुनें' : 'Choose one or more categories below')
                  : (hi ? `${selectedCategories.length} श्रेणियां चुनी गईं: ${selectedCategories.map((c) => c.label).join(', ')}` : `Uploading for ${selectedCategories.length} category: ${selectedCategories.map((c) => c.label).join(', ')}`)}
              </p>
            </div>
            {docs.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  reset();
                  setFormOpen(false);
                }}
                className="h-9 px-2.5 rounded-lg text-[13px] font-semibold text-[#5C5547] hover:bg-[#EFECE2] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            )}
          </div>

          {categories.length === 0 ? (
            <p className="text-[13px] text-[#5C5547]">No document categories are enabled. Ask an administrator to enable one.</p>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[12.5px] font-semibold text-[#181611]">
                    {hi ? 'दस्तावेज़ की श्रेणियां (Multiple select)' : 'Select Document Categories (Multiple select)'} <span className="text-[#C93B32]">*</span>
                  </label>
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={selectAll}
                      className="text-[#8C6200] hover:underline font-semibold"
                    >
                      {hi ? 'सभी चुनें' : 'Select All'}
                    </button>
                    <span className="text-[#C5BFAF]">|</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={clearSelection}
                      className="text-[#726C5D] hover:underline"
                    >
                      {hi ? 'हटाएं' : 'Clear'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 rounded-[10px] border border-[#E7E2D4] bg-[#FAF8F2] max-h-44 overflow-y-auto">
                  {categories.map((c) => {
                    const checked = selectedCategoryIds.includes(c.id);
                    const inB3 = b3CategoryIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[12.5px] cursor-pointer transition select-none ${
                          checked
                            ? 'bg-[#FFF5C4] border-[#D9AE00] font-semibold text-[#181611]'
                            : 'bg-white border-[#E7E2D4] text-[#4A4336] hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(c.id)}
                          disabled={busy}
                          className="w-4 h-4 rounded border-[#D7D1C2] text-[#FDC513] focus:ring-[#FDC513]"
                        />
                        <span className="flex-1 truncate">
                          {hi ? c.labelHi || c.label : c.label}
                          {c.requiredForSubmission ? ' *' : ''}
                        </span>
                        {inB3 && (
                          <span className="px-1 rounded text-[9.5px] font-bold bg-[#FDC513] text-[#181611]">
                            B3
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>

                <div>
                  <label htmlFor={`type-${householdId}`} className="block text-[12.5px] font-semibold text-[#181611] mb-1">
                    Document name <span className="font-normal text-[#726C5D]">(optional)</span>
                  </label>
                  <input
                    id={`type-${householdId}`}
                    type="text"
                    maxLength={120}
                    disabled={busy}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    placeholder={selectedCategories[0]?.label ?? 'e.g. Ration card (front)'}
                    className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px] text-[#181611] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00]"
                  />
                </div>
              </div>

              {anyRequiresLast4 && (
                <Last4Input id={`l4-${householdId}`} value={last4} onChange={setLast4} disabled={busy} required />
              )}

              <UploadDropzone files={files} onChange={setFiles} disabled={busy} />

              <label className="flex items-start gap-3 rounded-[10px] bg-[#FFF8D6] border border-[#EAD068] p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 w-5 h-5 accent-[#D9AE00] shrink-0"
                />
                <span className="text-[13px] text-[#181611] leading-relaxed">
                  <span className="font-semibold inline-flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-[#8C6200]" /> Consent confirmed.
                  </span>{' '}
                  The household agreed to this document being photographed and stored privately for verification.
                </span>
              </label>

              {formError && (
                <p role="alert" className="rounded-[10px] bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[12.5px] font-semibold text-[#A3312A]">
                  {formError}
                </p>
              )}

              {busy && (
                <div className="space-y-1" aria-live="polite">
                  <div className="w-full h-2 bg-[#E7E2D4] rounded-full overflow-hidden">
                    <div className="h-full bg-[#FDC513] transition-all duration-200" style={{ width: `${progress ?? 0}%` }} />
                  </div>
                  <p className="text-[12px] text-[#5C5547]">
                    {isOnline ? `Uploading… ${progress ?? 0}%` : 'Saving on this device…'}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={upload}
                disabled={busy}
                className="w-full h-12 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[14.5px] font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {isOnline ? 'Upload document' : 'Save on device'}
                {files.length > 0 && ` (${files.length} ${files.length === 1 ? 'page' : 'pages'})`}
              </button>
            </>
          )}
        </section>
      )}

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#181611]">
            Documents <span className="text-[#726C5D] font-medium">({docs.length})</span>
          </h3>
          {canUpload && !showForm && (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="h-10 px-3 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[13.5px] font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add document
            </button>
          )}
        </div>
        {docs.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-[#DFD9C8] bg-white px-4 py-5 text-center text-[13px] text-[#726C5D]">
            No documents for this household yet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {docs.map((d) => (
              <DocumentItem
                key={d.id}
                doc={d}
                categoryLabel={labelFor(d.categoryId)}
                canDelete={d.uploadedById === currentUser.id && d.verificationStatus !== 'VERIFIED'}
                onDelete={() => setToDelete(d)}
                pageUrl={pageUrl(d)}
              />
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete}
        variant="danger"
        title="Delete this document?"
        description={
          toDelete && isQueued(toDelete)
            ? 'It has not been uploaded yet and will be removed from this device.'
            : 'The pages will be permanently removed from the server.'
        }
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await removeDocument(toDelete.id);
          notify('Document deleted.');
          setToDelete(null);
        }}
      />
    </div>
  );
};

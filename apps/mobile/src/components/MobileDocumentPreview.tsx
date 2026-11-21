import React, { useEffect, useState } from 'react';
import { Download, FileText, Loader2, X } from 'lucide-react';
import type { HouseholdDocument } from '@m2s/shared/types/survey';
import { isPdfPage, maskAadhaar } from '@m2s/shared/components/DocumentCard';
import { StatusBadge } from '@m2s/shared/components/StatusBadge';
import { useMobileStore } from '../store/mobileStore';

interface MobileDocumentPreviewProps {
  doc: HouseholdDocument | null;
  onClose: () => void;
}

export const MobileDocumentPreview: React.FC<MobileDocumentPreviewProps> = ({ doc, onClose }) => {
  const { loadPreviewUrl } = useMobileStore();
  const [pageIdx, setPageIdx] = useState(0);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const page = doc?.pages[pageIdx];
  const pdf = isPdfPage(page);

  useEffect(() => {
    setPageIdx(0);
  }, [doc?.id]);

  useEffect(() => {
    if (!doc || !page?.localPreviewUrl) {
      setResolvedUrl(null);
      return undefined;
    }
    let alive = true;
    let revokeUrl: string | null = null;
    setLoading(true);
    setError(null);

    const raw = page.localPreviewUrl;
    if (raw.startsWith('blob:') || raw.startsWith('data:')) {
      setResolvedUrl(raw);
      setLoading(false);
      return undefined;
    }

    loadPreviewUrl(raw)
      .then((u) => {
        if (!alive) {
          if (u.startsWith('blob:') && u !== raw) URL.revokeObjectURL(u);
          return;
        }
        if (u.startsWith('blob:') && u !== raw) revokeUrl = u;
        setResolvedUrl(u);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Unable to load preview');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [doc, page?.localPreviewUrl, loadPreviewUrl]);

  if (!doc) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex flex-col justify-end sm:justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-[16px] overflow-hidden max-w-[520px] w-full mx-auto max-h-[92dvh] flex flex-col">
        <div className="px-4 py-3 border-b border-[#E7E2D4] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-[#181611] truncate">{doc.docType}</h3>
            <p className="text-[12px] text-[#5C5547] truncate">
              {doc.surveyCode || 'Draft'} · {doc.headName || 'Household'}
              {doc.aadhaarLast4 ? ` · ${maskAadhaar(doc.aadhaarLast4)}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="w-8 h-8 rounded-full bg-[#EFECE2] text-[#181611] grid place-items-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-2 bg-[#FAF8F2] border-b border-[#E7E2D4] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={doc.uploadStatus} />
            <StatusBadge status={doc.verificationStatus} />
          </div>
          {doc.pages.length > 1 && (
            <div className="flex items-center gap-1 text-[12px]">
              {doc.pages.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPageIdx(idx)}
                  className={`px-2 py-1 rounded font-semibold ${
                    idx === pageIdx ? 'bg-[#FDC513] text-[#181611]' : 'bg-white border border-[#DFD9C8] text-[#181611]'
                  }`}
                >
                  Pg {idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-[#181611] p-3 flex items-center justify-center min-h-[260px]">
          {loading ? (
            <div className="text-white/80 flex flex-col items-center gap-2 text-[13px]">
              <Loader2 className="w-6 h-6 animate-spin" />
              Loading secured document…
            </div>
          ) : error ? (
            <div className="text-[#FECACA] text-[13px] text-center p-4">{error}</div>
          ) : pdf ? (
            <div className="bg-white rounded-[12px] p-5 text-center space-y-3 max-w-xs">
              <FileText className="w-10 h-10 text-[#B42318] mx-auto" />
              <div className="text-[14px] font-bold text-[#181611] break-all">{page?.fileName || 'Document.pdf'}</div>
              {resolvedUrl && (
                <a
                  href={resolvedUrl}
                  download={page?.fileName || 'document.pdf'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-[#FDC513] text-[#181611] text-[13px] font-semibold"
                >
                  <Download className="w-4 h-4" />
                  Open / Download PDF
                </a>
              )}
            </div>
          ) : resolvedUrl ? (
            <img src={resolvedUrl} alt={doc.docType} className="max-h-[60dvh] w-auto object-contain rounded" />
          ) : (
            <div className="text-white/70 text-[13px]">No preview available offline.</div>
          )}
        </div>

        {doc.verificationStatus === 'REJECTED' && doc.rejectionReason && (
          <div className="px-4 py-2.5 bg-[#FDECEA] text-[#B42318] text-[12.5px] border-t border-[#F5C6C2]">
            <strong>Returned Reason:</strong> {doc.rejectionReason}
          </div>
        )}
      </div>
    </div>
  );
};


import React, { useEffect, useState } from 'react';
import { CircleCheck, CircleX, Download, Eye, FileText, ImageOff, RefreshCw, Trash2 } from 'lucide-react';
import { DocumentPageItem, HouseholdDocument } from '../types/survey';
import { StatusBadge } from './StatusBadge';

type PreviewLoader = (rawUrl: string) => Promise<string>;
let previewImageLoader: PreviewLoader | null = null;
export function setDocumentPreviewLoader(loader: PreviewLoader | null) {
  previewImageLoader = loader;
}

/** True for PDF pages (by MIME type or file extension). */
export const isPdfPage = (page?: Pick<DocumentPageItem, 'mime' | 'fileName'> | null): boolean =>
  !!page && (page.mime === 'application/pdf' || /\.pdf$/i.test(page.fileName ?? ''));

/** "XXXX-XXXX-1234" — the only form in which an Aadhaar reference is ever shown. */
export const maskAadhaar = (last4?: string | null): string =>
  last4 ? `XXXX-XXXX-${String(last4).replace(/\D/g, '').slice(-4).padStart(4, 'X')}` : '—';

/** Small image thumbnail of a document page; PDFs and broken images show an icon. */
export const DocThumb: React.FC<{
  doc: HouseholdDocument;
  pageIndex?: number;
  className?: string;
  iconClassName?: string;
}> = ({ doc, pageIndex = 0, className = '', iconClassName = 'w-6 h-6' }) => {
  const [failed, setFailed] = useState(false);
  const page = doc.pages[pageIndex];
  const pdf = isPdfPage(page);
  const rawUrl = page?.localPreviewUrl ?? '';
  const [resolvedUrl, setResolvedUrl] = useState(rawUrl);

  useEffect(() => {
    let alive = true;
    let revoke: string | null = null;
    setFailed(false);
    if (!rawUrl || pdf || !previewImageLoader || rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
      setResolvedUrl(rawUrl);
      return undefined;
    }
    previewImageLoader(rawUrl)
      .then((u) => {
        if (!alive) {
          if (u.startsWith('blob:') && u !== rawUrl) URL.revokeObjectURL(u);
          return;
        }
        if (u.startsWith('blob:') && u !== rawUrl) revoke = u;
        setResolvedUrl(u);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [rawUrl, pdf]);

  return (
    <span className={`relative overflow-hidden bg-[#EFECE2] flex items-center justify-center ${className}`}>
      {page && !pdf && !failed && resolvedUrl ? (
        <img
          src={resolvedUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : pdf ? (
        <span className="flex flex-col items-center gap-0.5 text-[#B42318]">
          <FileText className={iconClassName} strokeWidth={1.8} />
          <span className="text-[9.5px] font-bold tracking-wide">PDF</span>
        </span>
      ) : (
        <ImageOff className={`${iconClassName} text-[#8E8675]`} strokeWidth={1.8} />
      )}
    </span>
  );
};

const VERIFY_DOT: Record<HouseholdDocument['verificationStatus'], string> = {
  VERIFIED: 'bg-[#FDC513]',
  PENDING: 'bg-[#F2B31B]',
  REJECTED: 'bg-[#D64545]',
};

interface DocumentCardProps {
  doc: HouseholdDocument;
  onPreview: (doc: HouseholdDocument) => void;
  onRetryUpload?: (doc: HouseholdDocument) => void;
  onReplace?: (doc: HouseholdDocument) => void;
  onRemove?: (doc: HouseholdDocument) => void;
  /** 'row' = compact horizontal card (mobile lists), 'tile' = grid tile with a large thumbnail. */
  layout?: 'row' | 'tile';
  selected?: boolean;
  onToggleSelect?: (doc: HouseholdDocument) => void;
  onVerify?: (doc: HouseholdDocument) => void;
  onReject?: (doc: HouseholdDocument) => void;
  onDownload?: (doc: HouseholdDocument) => void;
  /** Disables action buttons while a request is running. */
  busy?: boolean;
}

const iconBtn =
  'h-9 min-w-[36px] px-2.5 rounded-[10px] border text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50';

export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  onPreview,
  onRetryUpload,
  onReplace,
  onRemove,
  layout = 'row',
  selected,
  onToggleSelect,
  onVerify,
  onReject,
  onDownload,
  busy = false,
}) => {
  const pages = `${doc.pages.length} ${doc.pages.length === 1 ? 'page' : 'pages'}`;

  const actions = (
    <>
      <button
        type="button"
        onClick={() => onPreview(doc)}
        className={`${iconBtn} flex-1 border-[#E7E2D4] bg-white text-[#181611] hover:border-[#D9AE00] hover:text-[#6E4D00]`}
      >
        <Eye className="w-4 h-4" />
        Preview
      </button>
      {onVerify && doc.verificationStatus !== 'VERIFIED' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onVerify(doc)}
          aria-label={`Verify ${doc.docType}`}
          title="Verify"
          className={`${iconBtn} border-[#EAD068] bg-[#FFF8D6] text-[#8C6200] hover:bg-[#FFF5C0]`}
        >
          <CircleCheck className="w-4 h-4" />
        </button>
      )}
      {onReject && doc.verificationStatus !== 'REJECTED' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onReject(doc)}
          aria-label={`Reject ${doc.docType}`}
          title="Reject"
          className={`${iconBtn} border-[#F5D2CF] bg-white text-[#B42318] hover:bg-[#FDECEA]`}
        >
          <CircleX className="w-4 h-4" />
        </button>
      )}
      {onDownload && (
        <button
          type="button"
          onClick={() => onDownload(doc)}
          aria-label={`Download ${doc.docType}`}
          title="Download"
          className={`${iconBtn} border-[#E7E2D4] bg-white text-[#181611] hover:border-[#D9AE00] hover:text-[#6E4D00]`}
        >
          <Download className="w-4 h-4" />
        </button>
      )}
      {doc.uploadStatus === 'UPLOAD_FAILED' && onRetryUpload && (
        <button
          type="button"
          onClick={() => onRetryUpload(doc)}
          className={`${iconBtn} border-[#F6E0A8] bg-[#FDF6E3] text-[#8A5A00]`}
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      )}
      {onReplace && (
        <button
          type="button"
          onClick={() => onReplace(doc)}
          className={`${iconBtn} border-[#E7E2D4] bg-white text-[#181611] hover:bg-[#EFECE2]`}
        >
          <RefreshCw className="w-4 h-4" />
          Replace
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRemove(doc)}
          aria-label={`Remove ${doc.docType}`}
          title="Delete"
          className={`${iconBtn} border-[#F5D2CF] bg-white text-[#C93B32] hover:bg-[#FDECEA]`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </>
  );

  const uploadBar = doc.uploadStatus === 'UPLOADING' && (
    <div className="space-y-1">
      <div className="w-full h-1.5 bg-[#E7E2D4] rounded-full overflow-hidden">
        <div className="h-full bg-[#FDC513] transition-all duration-200" style={{ width: `${doc.uploadProgress}%` }} />
      </div>
      <p className="text-[11.5px] text-[#5C5547]">Uploading securely… {doc.uploadProgress}%</p>
    </div>
  );

  const rejection = doc.rejectionReason && (
    <div className="rounded-[10px] bg-[#FFF6F5] border border-[#F5D2CF] px-3 py-2 text-[12px] text-[#B42318] leading-snug">
      <strong className="font-semibold">{doc.verificationStatus === 'REJECTED' ? 'Rejected:' : 'Note:'}</strong>{' '}
      {doc.rejectionReason}
    </div>
  );

  if (layout === 'tile') {
    return (
      <div
        className={`group bg-white rounded-[14px] border shadow-[0_1px_2px_rgba(24,22,17,0.04)] overflow-hidden flex flex-col transition-colors ${
          selected ? 'border-[#D9AE00] ring-2 ring-[#FDC513]/40' : 'border-[#E7E2D4] hover:border-[#D8D1BE]'
        }`}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => onPreview(doc)}
            className="block w-full"
            aria-label={`Preview ${doc.docType} for ${doc.surveyCode}`}
          >
            <DocThumb doc={doc} className="w-full aspect-[4/3]" iconClassName="w-8 h-8" />
          </button>
          {onToggleSelect && (
            <label className="absolute top-2 left-2 w-7 h-7 rounded-lg bg-white/95 shadow-sm flex items-center justify-center cursor-pointer">
              <input
                type="checkbox"
                aria-label={`Select ${doc.docType} for ${doc.surveyCode}`}
                checked={!!selected}
                onChange={() => onToggleSelect(doc)}
                className="m2s-check"
              />
            </label>
          )}
          <span className="absolute top-2 right-2">
            <StatusBadge status={doc.verificationStatus} labelOverride={doc.verificationStatus === 'PENDING' ? 'Pending' : undefined} dot />
          </span>
          <span className="absolute bottom-2 right-2 h-[20px] px-1.5 rounded-md bg-[#181611]/70 text-white text-[11px] font-medium leading-[20px]">
            {pages}
          </span>
        </div>
        <div className="p-3 flex-1 flex flex-col gap-2">
          <div className="min-w-0">
            <h4 className="text-[14px] font-semibold text-[#181611] truncate" title={doc.docType}>
              {doc.docType}
            </h4>
            <p className="text-[12px] text-[#5C5547] truncate mt-0.5">
              <span className="font-semibold text-[#8C6200]">{doc.surveyCode}</span> · {doc.headName || 'Household'}
            </p>
            <p className="text-[11.5px] text-[#726C5D] truncate mt-0.5">
              {doc.clusterName} · {doc.uploadedByName}
            </p>
            {doc.aadhaarLast4 && (
              <p className="text-[11.5px] font-mono text-[#8C6200] mt-0.5">{maskAadhaar(doc.aadhaarLast4)}</p>
            )}
          </div>
          {doc.uploadStatus !== 'UPLOADED' && <StatusBadge status={doc.uploadStatus} />}
          {uploadBar}
          {rejection}
          <div className="mt-auto pt-1 flex items-center gap-1.5">{actions}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-[14px] border p-3.5 shadow-[0_1px_2px_rgba(24,22,17,0.04)] space-y-3 ${
        selected ? 'border-[#D9AE00] ring-2 ring-[#FDC513]/40' : 'border-[#E7E2D4]'
      }`}
    >
      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <input
            type="checkbox"
            aria-label={`Select ${doc.docType}`}
            checked={!!selected}
            onChange={() => onToggleSelect(doc)}
            className="m2s-check mt-1 shrink-0"
          />
        )}
        <button
          type="button"
          onClick={() => onPreview(doc)}
          className="shrink-0 rounded-[8px] border border-[#DFD9C8] overflow-hidden hover:ring-2 hover:ring-[#FDC513]/40 transition"
          aria-label={`Preview ${doc.docType}`}
        >
          <DocThumb doc={doc} className="w-[76px] h-[56px]" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-[14px] font-semibold text-[#181611] truncate">{doc.docType}</h4>
            <span className="text-[11.5px] font-medium text-[#726C5D] shrink-0">{pages}</span>
          </div>
          <p className="text-[12px] text-[#5C5547] truncate mt-0.5 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${VERIFY_DOT[doc.verificationStatus]}`} />
            {doc.surveyCode} • {doc.headName} ({doc.clusterName})
          </p>
          {doc.aadhaarLast4 && (
            <p className="text-[11.5px] font-mono text-[#8C6200] mt-0.5">ID Ref: {maskAadhaar(doc.aadhaarLast4)}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <StatusBadge status={doc.uploadStatus} />
            <StatusBadge status={doc.verificationStatus} />
          </div>
        </div>
      </div>

      {uploadBar}
      {rejection}

      <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#EFECE2]">{actions}</div>
    </div>
  );
};

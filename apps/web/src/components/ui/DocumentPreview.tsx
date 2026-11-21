import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Download,
  FileText,
  Loader2,
  Lock,
  Maximize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { HouseholdDocument } from '../../types/survey';
import { useAppStore } from '../../store/appStore';
import { StatusBadge } from './StatusBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { DocThumb, isPdfPage, maskAadhaar } from './DocumentCard';
import { relativeTime } from '../dashboard/format';

interface DocumentPreviewProps {
  doc: HouseholdDocument | null;
  onClose: () => void;
  /** Optional document-level navigation (e.g. through a filtered list). */
  onPrevDoc?: () => void;
  onNextDoc?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Overrides for the built-in actions (by default the store is used and reviewers see Verify / Reject). */
  onVerify?: (doc: HouseholdDocument) => void;
  onReject?: (doc: HouseholdDocument) => void;
  onDownload?: (doc: HouseholdDocument) => void;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const REVIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

const fmtSize = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;

const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Modal document viewer: page strip, zoom, rotate, page navigation, download and reviewer verification. */
export const DocumentPreview: React.FC<DocumentPreviewProps> = (props) => {
  const { documents } = useAppStore();
  // Prefer the live copy from the store so verify / reject results show immediately.
  const doc = props.doc ? documents.find((d) => d.id === props.doc!.id) ?? props.doc : null;
  if (!doc) return null;
  // Keyed by id: page, zoom and audit state start fresh for every document.
  return <PreviewModal key={doc.id} {...props} doc={doc} />;
};

const PreviewModal: React.FC<DocumentPreviewProps & { doc: HouseholdDocument }> = ({
  doc,
  onClose,
  onPrevDoc,
  onNextDoc,
  hasPrev,
  hasNext,
  onVerify,
  onReject,
  onDownload,
}) => {
  const { currentUser, documentPageUrl, downloadDocument, verifyDocument, rejectDocument, notify, docCategories } = useAppStore();

  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState<'verify' | 'download' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  /** The first page shown is fetched with mode 'view' (writes the audit entry); every later load uses 'inline'. */
  const [leftFirstPage, setLeftFirstPage] = useState(false);
  const openedAt = useRef(Date.now()).current;

  const goPage = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(doc.pages.length - 1, i));
      if (next === pageIndex) return;
      setPageIndex(next);
      setLoading(true);
      setImgError(false);
      setRotation(0);
      setLeftFirstPage(true);
    },
    [doc, pageIndex]
  );

  const isReviewer = REVIEWER_ROLES.includes(currentUser.role);
  const onServer = doc.uploadStatus === 'UPLOADED';

  const handleVerify = useCallback(async () => {
    if (onVerify) return onVerify(doc);
    setBusy('verify');
    try {
      await verifyDocument(doc.id);
      notify(`${doc.docType} (${doc.surveyCode}) verified.`);
    } catch {
      /* store toasted */
    } finally {
      setBusy(null);
    }
  }, [doc, onVerify, verifyDocument, notify]);

  const handleReject = useCallback(() => {
    if (onReject) return onReject(doc);
    setRejectOpen(true);
  }, [doc, onReject]);

  const handleDownload = useCallback(async () => {
    if (onDownload) return onDownload(doc);
    setBusy('download');
    try {
      await downloadDocument(doc, pageIndex);
      notify(`Downloaded page ${pageIndex + 1} of ${doc.docType}.`);
    } catch {
      /* store toasted */
    } finally {
      setBusy(null);
    }
  }, [doc, onDownload, downloadDocument, notify, pageIndex]);

  // Keyboard: Esc closes, ←/→ pages, +/- zoom, R rotates. Capture phase so a drawer underneath does not also close.
  const keyState = useRef({ goPage, onClose, rejectOpen, pageIndex, onPrevDoc, onNextDoc, hasPrev, hasNext });
  keyState.current = { goPage, onClose, rejectOpen, pageIndex, onPrevDoc, onNextDoc, hasPrev, hasNext };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = keyState.current;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!s.rejectOpen) s.onClose();
        return;
      }
      if (s.rejectOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowRight') s.goPage(s.pageIndex + 1);
      else if (e.key === 'ArrowLeft') s.goPage(s.pageIndex - 1);
      else if (e.key === 'PageDown' && s.onNextDoc && s.hasNext) s.onNextDoc();
      else if (e.key === 'PageUp' && s.onPrevDoc && s.hasPrev) s.onPrevDoc();
      else if (e.key === '+' || e.key === '=') setZoom((z) => ZOOMS.find((x) => x > z) ?? z);
      else if (e.key === '-') setZoom((z) => [...ZOOMS].reverse().find((x) => x < z) ?? z);
      else if (e.key === 'r' || e.key === 'R') setRotation((r) => (r + 90) % 360);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const page = doc.pages[pageIndex] ?? doc.pages[0];
  const pdf = isPdfPage(page);
  const inlineUrl = page ? documentPageUrl(doc, pageIndex, 'inline') : '';
  let viewUrl = inlineUrl;
  if (page && !leftFirstPage) {
    viewUrl = documentPageUrl(doc, pageIndex, 'view');
    // Bust the browser cache so re-opening the document within the cache window is audited again.
    if (viewUrl.includes('audit=view')) viewUrl += `&opened=${openedAt}`;
  }
  const category = docCategories.find((c) => c.id === doc.categoryId);
  const canVerify = (isReviewer || !!onVerify) && onServer && doc.verificationStatus !== 'VERIFIED';
  const canReject = (isReviewer || !!onReject) && onServer && doc.verificationStatus !== 'REJECTED';

  const toolBtn =
    'w-9 h-9 rounded-[10px] flex items-center justify-center text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-35 disabled:hover:bg-transparent transition-colors';

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-[#181611]/70 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${doc.docType} preview`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !rejectOpen) onClose();
      }}
    >
      <div className="w-full max-w-6xl h-full sm:h-[92vh] bg-white sm:rounded-[14px] border border-[#E7E2D4] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-[#E7E2D4] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[17px] font-bold tracking-[-0.01em] text-[#181611] truncate">{doc.docType}</h3>
              <StatusBadge status={doc.verificationStatus} dot />
              {doc.uploadStatus !== 'UPLOADED' && <StatusBadge status={doc.uploadStatus} />}
            </div>
            <p className="text-[12.5px] text-[#5C5547] truncate mt-0.5">
              <span className="font-semibold text-[#8C6200]">{doc.surveyCode}</span> · {doc.headName} · {doc.clusterName}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {onPrevDoc && (
              <button
                type="button"
                disabled={!hasPrev}
                onClick={onPrevDoc}
                aria-label="Previous document"
                title="Previous document (PgUp)"
                className="h-9 px-2.5 rounded-[10px] border border-[#E7E2D4] text-[12.5px] font-semibold text-[#181611] inline-flex items-center gap-1 hover:bg-[#EFECE2] disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden md:inline">Prev doc</span>
              </button>
            )}
            {onNextDoc && (
              <button
                type="button"
                disabled={!hasNext}
                onClick={onNextDoc}
                aria-label="Next document"
                title="Next document (PgDn)"
                className="h-9 px-2.5 rounded-[10px] border border-[#E7E2D4] text-[12.5px] font-semibold text-[#181611] inline-flex items-center gap-1 hover:bg-[#EFECE2] disabled:opacity-40"
              >
                <span className="hidden md:inline">Next doc</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="w-9 h-9 rounded-[10px] border border-[#E7E2D4] flex items-center justify-center text-[#5C5547] hover:bg-[#EFECE2] hover:text-[#181611]"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Viewer */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#181611]">
            {/* Toolbar */}
            <div className="h-12 px-2 sm:px-3 flex items-center justify-between gap-2 border-b border-white/10 text-white">
              <div className="flex items-center gap-0.5">
                <button type="button" className={toolBtn} disabled={pageIndex <= 0} onClick={() => goPage(pageIndex - 1)} aria-label="Previous page" title="Previous page (←)">
                  <ChevronLeft className="w-[18px] h-[18px]" />
                </button>
                <span className="px-1.5 text-[12.5px] font-medium tabular-nums text-white/90 whitespace-nowrap">
                  Page {doc.pages.length ? pageIndex + 1 : 0} / {doc.pages.length}
                </span>
                <button
                  type="button"
                  className={toolBtn}
                  disabled={pageIndex >= doc.pages.length - 1}
                  onClick={() => goPage(pageIndex + 1)}
                  aria-label="Next page"
                  title="Next page (→)"
                >
                  <ChevronRight className="w-[18px] h-[18px]" />
                </button>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className={toolBtn}
                  disabled={pdf || zoom <= ZOOMS[0]}
                  onClick={() => setZoom((z) => [...ZOOMS].reverse().find((x) => x < z) ?? z)}
                  aria-label="Zoom out"
                  title="Zoom out (−)"
                >
                  <ZoomOut className="w-[18px] h-[18px]" />
                </button>
                <button
                  type="button"
                  disabled={pdf}
                  onClick={() => setZoom(1)}
                  title="Reset zoom"
                  className="h-9 min-w-[52px] px-1.5 rounded-[10px] text-[12.5px] font-semibold tabular-nums text-white/90 hover:bg-white/10 disabled:opacity-35"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className={toolBtn}
                  disabled={pdf || zoom >= ZOOMS[ZOOMS.length - 1]}
                  onClick={() => setZoom((z) => ZOOMS.find((x) => x > z) ?? z)}
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                >
                  <ZoomIn className="w-[18px] h-[18px]" />
                </button>
                <button
                  type="button"
                  className={toolBtn}
                  disabled={pdf}
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Rotate"
                  title="Rotate (R)"
                >
                  <RotateCw className="w-[17px] h-[17px]" />
                </button>
                <button
                  type="button"
                  className={toolBtn}
                  disabled={pdf || (zoom === 1 && rotation === 0)}
                  onClick={() => {
                    setZoom(1);
                    setRotation(0);
                  }}
                  aria-label="Fit to screen"
                  title="Fit to screen"
                >
                  <Maximize2 className="w-[16px] h-[16px]" />
                </button>
                <span className="w-px h-5 bg-white/15 mx-1" />
                <button
                  type="button"
                  className={toolBtn}
                  disabled={!page || busy === 'download'}
                  onClick={handleDownload}
                  aria-label="Download this page"
                  title="Download this page"
                >
                  {busy === 'download' ? <Loader2 className="w-[17px] h-[17px] animate-spin" /> : <Download className="w-[17px] h-[17px]" />}
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 min-h-[240px] overflow-auto relative">
              {!page ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-white/70 text-[13px]">
                  <FileText className="w-10 h-10" />
                  This document has no pages.
                </div>
              ) : pdf ? (
                <object key={inlineUrl} data={viewUrl} type="application/pdf" className="w-full h-full min-h-[60vh] bg-white" aria-label={page.fileName}>
                  <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center text-white/80 text-[13px]">
                    <FileText className="w-10 h-10" />
                    <p>This browser cannot display the PDF inline.</p>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="h-9 px-4 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[13px] font-semibold inline-flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Download PDF
                    </button>
                  </div>
                </object>
              ) : imgError ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-white/75 text-[13px] p-6 text-center">
                  <FileText className="w-10 h-10" />
                  The page could not be loaded. It may still be processing, or your session may have expired.
                </div>
              ) : (
                <div className="min-h-full min-w-full flex items-center justify-center p-4 sm:p-6">
                  {loading && (
                    <Loader2 className="absolute top-1/2 left-1/2 -ml-4 -mt-4 w-8 h-8 text-white/70 animate-spin" />
                  )}
                  <img
                    key={`${doc.id}-${pageIndex}`}
                    src={viewUrl}
                    alt={`${doc.docType} — page ${pageIndex + 1}`}
                    onLoad={() => setLoading(false)}
                    onError={() => {
                      setLoading(false);
                      setImgError(true);
                    }}
                    draggable={false}
                    className={`rounded-md shadow-2xl bg-white transition-transform duration-200 select-none ${loading ? 'opacity-0' : 'opacity-100'}`}
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      width: zoom === 1 ? undefined : `${zoom * 100}%`,
                      maxWidth: zoom === 1 ? '100%' : 'none',
                      maxHeight: zoom === 1 ? '72vh' : 'none',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Page strip */}
            {doc.pages.length > 1 && (
              <div className="shrink-0 border-t border-white/10 px-3 py-2.5 flex gap-2 overflow-x-auto">
                {doc.pages.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => goPage(i)}
                    aria-label={`Page ${i + 1}`}
                    aria-current={i === pageIndex ? 'page' : undefined}
                    className={`relative shrink-0 rounded-md overflow-hidden border-2 transition ${
                      i === pageIndex ? 'border-[#FDC513]' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <DocThumb doc={doc} pageIndex={i} className="w-[64px] h-[48px]" iconClassName="w-5 h-5" />
                    <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-black/60 text-white text-[10px] font-semibold">{i + 1}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <aside className="lg:w-[300px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#E7E2D4] bg-white flex flex-col max-h-[40vh] lg:max-h-none">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[13px]">
              <dl className="space-y-2.5">
                <Meta label="Category" value={category?.label ?? doc.categoryId} />
                {doc.aadhaarLast4 && <Meta label="Aadhaar reference" value={<span className="font-mono text-[#8C6200]">{maskAadhaar(doc.aadhaarLast4)}</span>} />}
                <Meta label="Uploaded by" value={`${doc.uploadedByName} · ${relativeTime(doc.uploadedAt)}`} />
                <Meta label="Uploaded at" value={fmtDateTime(doc.uploadedAt)} />
                <Meta label="Consent" value={doc.consentConfirmed ? 'Confirmed by household' : 'Not recorded'} />
                {page && <Meta label="This page" value={`${page.fileName} · ${fmtSize(page.sizeBytes)}`} />}
                {doc.verifiedByName && (
                  <Meta
                    label={doc.verificationStatus === 'REJECTED' ? 'Rejected by' : 'Verified by'}
                    value={`${doc.verifiedByName}${doc.verifiedAt ? ` · ${fmtDateTime(doc.verifiedAt)}` : ''}`}
                  />
                )}
              </dl>
              {doc.rejectionReason && (
                <div className="rounded-[10px] bg-[#FFF6F5] border border-[#F5D2CF] px-3 py-2 text-[12.5px] text-[#B42318] leading-snug">
                  <strong className="font-semibold">Reason:</strong> {doc.rejectionReason}
                </div>
              )}
              {!onServer && (
                <div className="rounded-[10px] bg-[#E6EEF9] px-3 py-2 text-[12.5px] text-[#2D5E9E] leading-snug">
                  This document is stored on this device and has not been uploaded yet.
                </div>
              )}
              <p className="flex items-start gap-2 text-[11.5px] text-[#726C5D] leading-snug">
                <Lock className="w-3.5 h-3.5 mt-px shrink-0" />
                Served from private storage to signed-in staff only. Opening and downloading are recorded in the audit log.
              </p>
            </div>

            {(canVerify || canReject) && (
              <div className="p-3 border-t border-[#E7E2D4] bg-[#FAF8F2] flex gap-2">
                {canReject && (
                  <button
                    type="button"
                    disabled={busy === 'verify'}
                    onClick={handleReject}
                    className="flex-1 h-10 rounded-[10px] border border-[#F5D2CF] bg-white text-[#B42318] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#FDECEA] disabled:opacity-50"
                  >
                    <CircleX className="w-4 h-4" />
                    Reject
                  </button>
                )}
                {canVerify && (
                  <button
                    type="button"
                    disabled={busy === 'verify'}
                    onClick={handleVerify}
                    className="flex-1 h-10 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-70"
                  >
                    {busy === 'verify' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CircleCheck className="w-4 h-4" />}
                    Verify
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={rejectOpen}
        title="Reject document"
        description={
          <>
            <strong className="text-[#181611]">{doc.docType}</strong> for {doc.surveyCode} will be marked as rejected. The volunteer
            will see your reason and can upload a replacement.
          </>
        }
        variant="danger"
        confirmLabel="Reject document"
        requireReason
        reasonPlaceholder="e.g. Photo is blurred — the name is not readable"
        onCancel={() => setRejectOpen(false)}
        onConfirm={async (reason) => {
          await rejectDocument(doc.id, reason);
          notify(`${doc.docType} (${doc.surveyCode}) rejected.`);
          setRejectOpen(false);
        }}
      />
    </div>,
    document.body
  );
};

const Meta: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-[11.5px] font-semibold text-[#726C5D]">{label}</dt>
    <dd className="text-[13px] text-[#181611] mt-0.5 break-words">{value}</dd>
  </div>
);

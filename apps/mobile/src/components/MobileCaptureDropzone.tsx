import React, { useEffect, useId, useRef, useState } from 'react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ArrowLeft, ArrowRight, Camera, FileText, FolderOpen, ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { base64ToValidatedFile, MAX_DOCUMENT_FILE_BYTES, MAX_DOCUMENT_PAGES, prepareDocumentFile } from '@m2s/shared/utils/fileCapture';
import { isNativeCapacitor } from '../api/http';

interface StagedPage {
  id: string;
  file: File;
  previewUrl: string | null;
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
}

interface MobileCaptureDropzoneProps {
  docLabel: string;
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: number;
  onUpload: (files: File[]) => Promise<void> | void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const MobileCaptureDropzone: React.FC<MobileCaptureDropzoneProps> = ({
  docLabel,
  disabled,
  uploading = false,
  uploadProgress = 0,
  onUpload,
}) => {
  const cameraInputId = useId();
  const fileInputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pages, setPages] = useState<StagedPage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, []);

  const stageValidatedFiles = async (rawFiles: File[]) => {
    setProcessing(true);
    setError(null);
    const added: StagedPage[] = [];
    const errors: string[] = [];
    const room = MAX_DOCUMENT_PAGES - pagesRef.current.length;
    if (rawFiles.length > room) {
      errors.push(`Only ${MAX_DOCUMENT_PAGES} pages per document. Extra pages were not added.`);
      rawFiles = rawFiles.slice(0, Math.max(0, room));
    }

    for (const raw of rawFiles) {
      try {
        const res = await prepareDocumentFile(raw, {
          maxDimension: 1600,
          quality: 0.82,
          compressThresholdBytes: 300 * 1024,
        });
        const previewUrl = res.mime.startsWith('image/') ? URL.createObjectURL(res.file) : null;
        added.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file: res.file,
          previewUrl,
          compressed: res.compressed,
          originalBytes: res.originalSizeBytes,
          finalBytes: res.finalSizeBytes,
        });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `Rejected "${raw.name}".`);
      }
    }

    if (added.length > 0) {
      setPages((prev) => [...prev, ...added]);
    }
    if (errors.length > 0) {
      setError(errors.join(' '));
    }
    setProcessing(false);
  };

  const pagesFull = pages.length >= MAX_DOCUMENT_PAGES;
  const rejectIfFull = () => {
    if (!pagesFull) return false;
    setError(`Only ${MAX_DOCUMENT_PAGES} pages per document. Upload these first, then add the rest as another document.`);
    return true;
  };

  const handleCapturePhoto = async () => {
    if (disabled || uploading || processing) return;
    setError(null);
    if (rejectIfFull()) return;

    if (isNativeCapacitor()) {
      try {
        const photo = await CapCamera.getPhoto({
          source: CameraSource.Camera,
          resultType: CameraResultType.Base64,
          quality: 85,
          width: 2000,
          correctOrientation: true,
        });
        if (!photo.base64String) {
          throw new Error('No image data returned from device camera.');
        }
        const ext = (photo.format || 'jpeg').toLowerCase() === 'png' ? 'png' : 'jpg';
        const validated = await base64ToValidatedFile(photo.base64String, `camera_${Date.now()}.${ext}`);
        await stageValidatedFiles([validated]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Camera capture failed.';
        if (!/cancel/i.test(msg)) setError(msg);
      }
      return;
    }

    cameraRef.current?.click();
  };

  const handleNativeGallery = async () => {
    if (disabled || uploading || processing) return;
    setError(null);
    if (rejectIfFull()) return;

    if (isNativeCapacitor()) {
      try {
        const room = Math.max(1, MAX_DOCUMENT_PAGES - pagesRef.current.length);
        const res = await CapCamera.pickImages({
          quality: 85,
          limit: room,
        });
        if (res.photos && res.photos.length > 0) {
          const files: File[] = [];
          for (let i = 0; i < res.photos.length; i++) {
            const p = res.photos[i];
            if (p.webPath) {
              const blob = await fetch(p.webPath).then((r) => r.blob());
              const ext = (p.format || 'jpeg').toLowerCase() === 'png' ? 'png' : 'jpg';
              files.push(new File([blob], `gallery_${Date.now()}_${i}.${ext}`, { type: blob.type || 'image/jpeg' }));
            }
          }
          if (files.length > 0) {
            await stageValidatedFiles(files);
            return;
          }
        }
      } catch {
        // Fallback to single getPhoto if pickImages fails
      }

      try {
        const photo = await CapCamera.getPhoto({
          source: CameraSource.Photos,
          resultType: CameraResultType.Base64,
          quality: 85,
          width: 2000,
          correctOrientation: true,
        });
        if (!photo.base64String) return;
        const ext = (photo.format || 'jpeg').toLowerCase() === 'png' ? 'png' : 'jpg';
        const validated = await base64ToValidatedFile(photo.base64String, `gallery_${Date.now()}.${ext}`);
        await stageValidatedFiles([validated]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Gallery selection failed.';
        if (!/cancel/i.test(msg)) setError(msg);
      }
      return;
    }

    fileRef.current?.click();
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (selected.length > 0) {
      await stageValidatedFiles(selected);
    }
  };

  const movePage = (idx: number, delta: -1 | 1) => {
    setPages((prev) => {
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const submitPages = async () => {
    if (!pages.length || disabled || uploading) return;
    try {
      await onUpload(pages.map((p) => p.file));
      pages.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
      setPages([]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  return (
    <div className="rounded-[14px] border border-dashed border-[#DFD9C8] bg-[#FAF8F2] p-3.5 space-y-3">
      {/* Hidden Web / Fallback Inputs */}
      <input
        id={cameraInputId}
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInput}
        className="hidden"
      />
      <input
        id={fileInputId}
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
        multiple
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-[14px] font-bold text-[#181611]">Capture or Select: {docLabel}</h4>
          <p className="text-[11.5px] text-[#5C5547]">
            JPG, PNG or PDF · Max {Math.round(MAX_DOCUMENT_FILE_BYTES / (1024 * 1024))} MB per page · Up to {MAX_DOCUMENT_PAGES} pages
          </p>
        </div>
        {processing && <Loader2 className="w-4 h-4 text-[#8C6200] animate-spin shrink-0 mt-0.5" />}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-3 gap-2">
        <button
          type="button"
          disabled={disabled || uploading || processing}
          onClick={handleCapturePhoto}
          className="h-11 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] disabled:opacity-50 text-[#181611] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Camera className="w-4 h-4 shrink-0" />
          Camera
        </button>

        <button
          type="button"
          disabled={disabled || uploading || processing}
          onClick={handleNativeGallery}
          className="h-11 rounded-[10px] bg-white border border-[#DFD9C8] hover:bg-[#EFECE2] disabled:opacity-50 text-[#181611] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <ImagePlus className="w-4 h-4 text-[#8C6200] shrink-0" />
          Gallery
        </button>

        <button
          type="button"
          disabled={disabled || uploading || processing}
          onClick={() => fileRef.current?.click()}
          className="h-11 rounded-[10px] bg-white border border-[#DFD9C8] hover:bg-[#EFECE2] disabled:opacity-50 text-[#181611] text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <FolderOpen className="w-4 h-4 text-[#B42318] shrink-0" />
          PDF / File
        </button>
      </div>

      {error && (
        <div className="rounded-[10px] bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[12px] text-[#B42318]">
          {error}
        </div>
      )}

      {/* Staged Pages Preview & Ordering */}
      {pages.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between text-[12px] font-semibold text-[#181611]">
            <span>{pages.length} page(s) staged</span>
            <button
              type="button"
              onClick={() => {
                pages.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
                setPages([]);
              }}
              disabled={uploading}
              className="text-[#B42318] hover:underline"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {pages.map((p, idx) => (
              <div key={p.id} className="rounded-[10px] bg-white border border-[#DFD9C8] overflow-hidden flex flex-col">
                <div className="relative h-28 bg-[#EFECE2] flex items-center justify-center">
                  {p.previewUrl ? (
                    <img src={p.previewUrl} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-[#B42318]">
                      <FileText className="w-7 h-7" />
                      <span className="text-[11px] font-bold">PDF DOCUMENT</span>
                    </div>
                  )}
                  <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                    Page {idx + 1}
                  </span>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => removePage(p.id)}
                    aria-label={`Remove page ${idx + 1}`}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/95 text-[#B42318] grid place-items-center shadow"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2 text-[11px] space-y-1">
                  <div className="font-medium text-[#181611] truncate">{p.file.name}</div>
                  <div className="text-[#5C5547]">
                    {formatBytes(p.finalBytes)}
                    {p.compressed && (
                      <span className="text-[#8C6200] font-semibold"> (from {formatBytes(p.originalBytes)})</span>
                    )}
                  </div>
                  {pages.length > 1 && (
                    <div className="flex items-center gap-1 pt-0.5">
                      <button
                        type="button"
                        disabled={idx === 0 || uploading}
                        onClick={() => movePage(idx, -1)}
                        className="flex-1 h-7 rounded border border-[#DFD9C8] disabled:opacity-40 grid place-items-center"
                        aria-label="Move page earlier"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pages.length - 1 || uploading}
                        onClick={() => movePage(idx, 1)}
                        className="flex-1 h-7 rounded border border-[#DFD9C8] disabled:opacity-40 grid place-items-center"
                        aria-label="Move page later"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[12px] font-semibold text-[#8C6200]">
                <span>Uploading securely…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#DFD9C8] overflow-hidden">
                <div className="h-full bg-[#FDC513] transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={uploading || disabled}
            onClick={submitPages}
            className="w-full h-11 rounded-[10px] bg-[#181611] hover:bg-[#2C281F] disabled:opacity-50 text-[#FDC513] text-[13.5px] font-bold inline-flex items-center justify-center gap-2 shadow"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? `Uploading (${uploadProgress}%)` : `Upload ${pages.length} Page${pages.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
};


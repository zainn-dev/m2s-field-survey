import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, FileText, ImagePlus, X } from 'lucide-react';

export const MAX_PAGES = 10;
export const MAX_PAGE_BYTES = 10 * 1024 * 1024;
/** Photos are compressed (to ~1600px JPEG) before upload, so a large raw camera photo is still fine. */
const MAX_RAW_IMAGE_BYTES = 40 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const EXT_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };

/** Some Android cameras / file pickers omit the MIME type, so fall back to the extension. */
export function fileMime(f: File): string {
  if (f.type) return f.type === 'image/jpg' ? 'image/jpeg' : f.type;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? '';
}

const formatSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

interface UploadDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  maxPages?: number;
}

/**
 * Multi-page capture: camera or gallery/PDF picker, then reorder or remove pages before upload.
 * Only JPG / PNG / PDF pages up to 10 MB each, at most 10 pages (the API enforces the same limits).
 */
export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ files, onChange, disabled = false, maxPages = MAX_PAGES }) => {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Object URLs for image previews, revoked when the page list changes or the component unmounts.
  // Created inside the effect so StrictMode's mount/unmount/mount cycle never leaves revoked URLs on screen.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => (fileMime(f).startsWith('image/') ? URL.createObjectURL(f) : ''));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const problems: string[] = [];
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= maxPages) {
        problems.push(`Only ${maxPages} pages per document. Extra pages were not added.`);
        break;
      }
      if (!ALLOWED.has(fileMime(f))) {
        problems.push(`${f.name}: only JPG, PNG or PDF files are accepted.`);
        continue;
      }
      const limit = fileMime(f) === 'application/pdf' ? MAX_PAGE_BYTES : MAX_RAW_IMAGE_BYTES;
      if (f.size > limit) {
        problems.push(`${f.name} is ${formatSize(f.size)}; the limit is ${Math.round(limit / 1024 / 1024)} MB per ${fileMime(f) === 'application/pdf' ? 'PDF page' : 'photo'}.`);
        continue;
      }
      if (f.size === 0) {
        problems.push(`${f.name} is empty.`);
        continue;
      }
      next.push(f);
    }
    setErrors(problems);
    if (next.length !== files.length) onChange(next);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= files.length) return;
    const next = files.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = (i: number) => {
    setErrors([]);
    onChange(files.filter((_, k) => k !== i));
  };

  const full = files.length >= maxPages;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => cameraRef.current?.click()}
          className="h-12 px-3 rounded-[10px] bg-[#FDC513] hover:bg-[#E5B00D] text-[#181611] font-semibold text-[14px] inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
        >
          <Camera className="w-5 h-5 shrink-0" />
          Take photo
        </button>
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => galleryRef.current?.click()}
          className="h-12 px-3 rounded-[10px] border border-[#D9AE00] bg-white hover:bg-[#FFF8D6] text-[#8C6200] font-semibold text-[14px] inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
        >
          <ImagePlus className="w-5 h-5 shrink-0" />
          Gallery / PDF
        </button>
      </div>
      <p className="text-[12px] text-[#726C5D]">
        JPG, PNG or PDF · up to {maxPages} pages · 10 MB per page. {files.length > 0 && `${files.length} of ${maxPages} added.`}
      </p>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {errors.length > 0 && (
        <ul className="rounded-[10px] bg-[#FDECEA] border border-[#F5C6C2] px-3 py-2 text-[12.5px] text-[#A3312A] space-y-0.5" role="alert">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ol className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" aria-label="Pages to upload">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="relative rounded-[10px] border border-[#E7E2D4] bg-white p-1.5">
              <div className="h-28 rounded-lg bg-[#FAF8F2] overflow-hidden flex items-center justify-center">
                {previews[i] ? (
                  <img src={previews[i]} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-[#8C6200]">
                    <FileText className="w-9 h-9" />
                    <span className="text-[11px] font-semibold">PDF</span>
                  </div>
                )}
              </div>
              <div className="mt-1.5 px-0.5">
                <div className="text-[12px] font-semibold text-[#181611]">Page {i + 1}</div>
                <div className="text-[11px] text-[#726C5D] truncate" title={f.name}>
                  {f.name} · {formatSize(f.size)}
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={`Move page ${i + 1} earlier`}
                  className="flex-1 h-9 rounded-lg border border-[#E7E2D4] text-[#5C5547] hover:bg-[#FAF8F2] disabled:opacity-35 inline-flex items-center justify-center"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={disabled || i === files.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Move page ${i + 1} later`}
                  className="flex-1 h-9 rounded-lg border border-[#E7E2D4] text-[#5C5547] hover:bg-[#FAF8F2] disabled:opacity-35 inline-flex items-center justify-center"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(i)}
                  aria-label={`Remove page ${i + 1}`}
                  className="flex-1 h-9 rounded-lg border border-[#F5C6C2] text-[#C93B32] hover:bg-[#FDECEA] disabled:opacity-35 inline-flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

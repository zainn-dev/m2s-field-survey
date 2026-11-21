export type AllowedCaptureMime = 'image/jpeg' | 'image/png' | 'application/pdf';

export const MAX_DOCUMENT_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Raw camera photos may exceed the upload limit before compression; the limit applies to the prepared file. */
const MAX_RAW_IMAGE_BYTES = 40 * 1024 * 1024;
/** Server-side cap on pages per document (FilesInterceptor limit). */
export const MAX_DOCUMENT_PAGES = 10;

export interface ValidatedCaptureResult {
  file: File;
  mime: AllowedCaptureMime;
  compressed: boolean;
  originalSizeBytes: number;
  finalSizeBytes: number;
}

/**
 * Inspects leading file signature (magic bytes) rather than trusting file extension or OS MIME.
 * Accepts JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A), and PDF (%PDF-).
 */
export function detectMagicMime(bytes: Uint8Array): AllowedCaptureMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  ) {
    return 'application/pdf';
  }
  return null;
}

export async function validateDocumentFile(file: File, maxBytes = MAX_DOCUMENT_FILE_BYTES): Promise<AllowedCaptureMime> {
  if (file.size <= 0) {
    throw new Error(`File "${file.name}" is empty.`);
  }
  if (file.size > maxBytes) {
    throw new Error(`File "${file.name}" exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
  }
  const headBuf = await file.slice(0, 16).arrayBuffer();
  const detected = detectMagicMime(new Uint8Array(headBuf));
  if (!detected) {
    throw new Error(`Unsupported or corrupted file "${file.name}". Only real JPG, PNG, and PDF files are accepted.`);
  }
  return detected;
}

function normalizedExtension(mime: AllowedCaptureMime): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'application/pdf') return '.pdf';
  return '.jpg';
}

function renameWithExtension(name: string, mime: AllowedCaptureMime): string {
  const ext = normalizedExtension(mime);
  const clean = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/\.[^.]+$/, '');
  return `${clean || 'document'}${ext}`;
}

/**
 * Validates actual file magic bytes and compresses large camera/gallery photos via Canvas
 * when running in a browser or Capacitor WebView, keeping legible document text while reducing mobile payload size.
 */
export async function prepareDocumentFile(
  file: File,
  options: { maxDimension?: number; quality?: number; compressThresholdBytes?: number } = {}
): Promise<ValidatedCaptureResult> {
  const detected = await validateDocumentFile(file, MAX_RAW_IMAGE_BYTES);
  if (detected === 'application/pdf' && file.size > MAX_DOCUMENT_FILE_BYTES) {
    throw new Error(`File "${file.name}" exceeds the ${Math.round(MAX_DOCUMENT_FILE_BYTES / (1024 * 1024))} MB limit.`);
  }
  const result = await prepareValidated(file, detected, options);
  if (result.finalSizeBytes > MAX_DOCUMENT_FILE_BYTES) {
    throw new Error(`File "${file.name}" is still larger than ${Math.round(MAX_DOCUMENT_FILE_BYTES / (1024 * 1024))} MB after compression.`);
  }
  return result;
}

async function prepareValidated(
  file: File,
  detected: AllowedCaptureMime,
  options: { maxDimension?: number; quality?: number; compressThresholdBytes?: number }
): Promise<ValidatedCaptureResult> {
  const originalSizeBytes = file.size;
  const maxDimension = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.82;
  const compressThresholdBytes = options.compressThresholdBytes ?? 350 * 1024;

  // PDFs and compact images stay untouched (just ensure normalized safe extension + real MIME)
  if (detected === 'application/pdf' || originalSizeBytes <= compressThresholdBytes || typeof document === 'undefined') {
    const safeFile =
      file.type === detected
        ? file
        : new File([file], renameWithExtension(file.name, detected), { type: detected, lastModified: file.lastModified });
    return {
      file: safeFile,
      mime: detected,
      compressed: false,
      originalSizeBytes,
      finalSizeBytes: safeFile.size,
    };
  }

  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { file, mime: detected, compressed: false, originalSizeBytes, finalSizeBytes: originalSizeBytes };
    }
    ctx.drawImage(bitmap.source, 0, 0, width, height);
    bitmap.cleanup();

    const targetMime: AllowedCaptureMime = 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, targetMime, quality));
    if (!blob || blob.size >= originalSizeBytes) {
      return { file, mime: detected, compressed: false, originalSizeBytes, finalSizeBytes: originalSizeBytes };
    }

    const outFile = new File([blob], renameWithExtension(file.name, targetMime), {
      type: targetMime,
      lastModified: Date.now(),
    });
    return {
      file: outFile,
      mime: targetMime,
      compressed: true,
      originalSizeBytes,
      finalSizeBytes: outFile.size,
    };
  } catch {
    return { file, mime: detected, compressed: false, originalSizeBytes, finalSizeBytes: originalSizeBytes };
  }
}

async function loadBitmap(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/** Converts a base64 string or data URL (e.g. from Capacitor Camera/Filesystem) into a magic-byte validated File. */
export async function base64ToValidatedFile(base64OrDataUrl: string, fileName: string): Promise<File> {
  const rawBase64 = base64OrDataUrl.includes(',') ? base64OrDataUrl.split(',')[1] : base64OrDataUrl;
  const bin = atob(rawBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = detectMagicMime(bytes);
  if (!mime) {
    throw new Error('Captured photo/file failed magic-byte validation (expected JPG, PNG, or PDF).');
  }
  return new File([bytes], renameWithExtension(fileName, mime), { type: mime, lastModified: Date.now() });
}


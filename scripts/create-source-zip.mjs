/**
 * Creates a clean distributable source ZIP without secrets, database data, private uploads,
 * node_modules, or generated build/APK outputs (`npm run package:source`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(rootDir, 'dist-release', 'm2s-field-survey-clean-src.zip');

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  '.pgdata',
  '.storage',
  'backups',
  'dist',
  'dist-release',
  'build',
  '.gradle',
  '.idea',
  '.cxx',
  'coverage',
  '.vite',
]);

const FORBIDDEN_FILE_PATTERNS = [
  /^\.env$/i,
  /^\.env\.(local|production|development|staging|emulator)$/i,
  /^keystore\.properties$/i,
  /^local\.properties$/i,
  /\.db$/i,
  /\.sqlite$/i,
  /\.apk$/i,
  /\.aab$/i,
  /\.keystore$/i,
  /\.jks$/i,
  /\.pem$/i,
  /\.key$/i,
  /^tsbuildinfo$/i,
  /\.tsbuildinfo$/i,
];

function isExcludedPath(relPosix) {
  const parts = relPosix.split('/');
  for (const part of parts.slice(0, -1)) {
    if (EXCLUDED_DIRS.has(part)) return true;
  }
  const base = parts[parts.length - 1];
  if (EXCLUDED_DIRS.has(base)) return true;
  // Also exclude Android native build intermediates under apps/mobile/android/
  if (/^apps\/mobile\/android\/(build|app\/build|\.gradle)\//.test(relPosix)) return true;
  // Allow .env.example while excluding real .env files
  if (/^\.env/i.test(base) && base !== '.env.example') return true;
  return FORBIDDEN_FILE_PATTERNS.some((rx) => rx.test(base));
}

function collectFiles(dir, relBase = '') {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (EXCLUDED_DIRS.has(ent.name)) continue;
      if (/^apps\/mobile\/android\/(build|app\/build|\.gradle)$/.test(rel)) continue;
      out.push(...collectFiles(full, rel));
    } else if (ent.isFile()) {
      if (!isExcludedPath(rel)) out.push({ full, rel });
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const { full, rel } of files) {
    const raw = fs.readFileSync(full);
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;

    const nameBytes = Buffer.from(rel, 'utf8');
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x5421, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x5421, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    locals.push(local, payload);
    centrals.push(central);
    offset += local.length + payload.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDir, eocd]);
}

const files = collectFiles(rootDir);

// Self-audit before writing archive
const leaked = files.filter(
  (f) =>
    (/(^|\/)\.env($|\.)/i.test(f.rel) && !/\.env\.example$/i.test(f.rel)) ||
    /(^|\/)(node_modules|\.pgdata|\.storage|backups|dist|dist-release)\//.test(f.rel) ||
    /(^|\/)(keystore\.properties|local\.properties)$/i.test(f.rel) ||
    /\.(apk|aab|keystore|jks)$/i.test(f.rel)
);
if (leaked.length > 0) {
  console.error('[ZIP] Security audit failed; forbidden paths staged:', leaked.map((l) => l.rel));
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const archive = buildZip(files);
fs.writeFileSync(outPath, archive);
console.log(`[ZIP] Created clean source archive (${files.length} files, ${(archive.length / (1024 * 1024)).toFixed(2)} MB): ${outPath}`);

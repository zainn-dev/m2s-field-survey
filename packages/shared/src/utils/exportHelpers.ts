import { HouseholdDocument, SurveyRecord } from '../types/survey';
import { PART1_OPTIONS, QUESTIONS } from '../data/questionnaire';
import { defaultAnswerNormalizer } from '../validation/normalizer';
import { evaluateHouseholdIndices, MPI_INDICATORS } from './studyIndicators';

function escapeCsvCell(value: unknown): string {
  let s = value == null ? '' : Array.isArray(value) ? value.join('|') : String(value);
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lookupLabel(list: { code: string; en: string }[], code: string): string {
  return list.find((item) => item.code === code)?.en ?? code;
}

export function buildSurveysCsv(surveys: SurveyRecord[]): string {
  const headers = [
    'Survey ID',
    'Survey Code',
    'Date',
    'Cluster / Camp',
    'District (B1)',
    'District Other',
    'Village / Relief Camp Name (B1)',
    'Head of Household (B3)',
    'Head Age',
    'Family Size (B4)',
    'Income Before (B9)',
    'Income Now (B9)',
    'Land Owned (B10a)',
    'Land Size (B10b)',
    'Land Tenure Doc (B10c)',
    'Status',
    'Volunteer',
    'ID Type (B2)',
    'ID Last 4',
    'GPS Consent',
    'GPS Lat',
    'GPS Lng',
    'Interview Duration (sec)',
    ...QUESTIONS.map((q) => q.id),
    'MPI Score (%)',
    'MPI Poor (>=33.3%)',
    'MPI Deprived Indicators',
    'Hunger Score (Q11, 0-6)',
    'Hunger Category',
    'Q14 Drinking Water OptionKey',
    'Q20 Bank/Debt OptionKey',
    'Q14 Semantic Category',
    'Q20 Semantic Category',
    'Duplicate-Code OptionKeys',
    'Semantic Ambiguous Flags',
  ];

  const rows = surveys.map((s) => {
    const idx = evaluateHouseholdIndices(s);
    const districtLabel =
      s.profile.districtCode === '16' && s.profile.districtOther
        ? `Other: ${s.profile.districtOther}`
        : lookupLabel(PART1_OPTIONS.b1Districts, s.profile.districtCode ?? '');
    const landDocLabel =
      s.profile.landDocTypeCode === '5' && s.profile.landDocOther
        ? `Other: ${s.profile.landDocOther}`
        : lookupLabel(PART1_OPTIONS.b10LandDocType, s.profile.landDocTypeCode ?? '');
    const base = [
      s.id,
      s.surveyCode,
      s.profile.surveyDate,
      s.clusterName,
      districtLabel,
      s.profile.districtOther ?? '',
      s.profile.revenueCircleVillage ?? '',
      s.profile.headName,
      s.profile.headAge,
      s.profile.totalMembers,
      s.profile.incomeBeforeApprox,
      lookupLabel(PART1_OPTIONS.b9Income, s.profile.incomeNowCode),
      lookupLabel(PART1_OPTIONS.b10LandOwned, s.profile.landOwnedCode ?? ''),
      s.profile.landBighas || lookupLabel(PART1_OPTIONS.b10LandSize, s.profile.landSizeCode ?? ''),
      landDocLabel,
      s.status,
      s.volunteerName,
      s.profile.docVerifiedLabel,
      s.profile.idLast4 ? `XXXX-${s.profile.idLast4}` : 'N/A',
      s.gpsConsent ? 'YES' : 'NO',
      s.gpsConsent && s.gpsLat != null ? s.gpsLat : '',
      s.gpsConsent && s.gpsLng != null ? s.gpsLng : '',
      s.durationSec ?? '',
    ];
    const qCells = QUESTIONS.map((q) => {
      const ans = s.answers[q.id];
      if (!ans) return '';
      if (q.type === 'text' || q.type === 'date') return ans.otherText ?? '';
      return ans.optionCodes.join('|') + (ans.otherText ? ` (${ans.otherText})` : '');
    });
    const q14Norm = defaultAnswerNormalizer.normalizeAnswer('Q14', s.answers.Q14);
    const q20Norm = defaultAnswerNormalizer.normalizeAnswer('Q20', s.answers.Q20);
    const dupKeyEntries: string[] = [];
    const ambiguousFlags: string[] = [];
    for (const q of QUESTIONS) {
      if (!defaultAnswerNormalizer.hasDuplicateNumericCodes(q.id)) continue;
      const n = defaultAnswerNormalizer.normalizeAnswer(q.id, s.answers[q.id]);
      if (n.is_missing) continue;
      if (n.is_ambiguous_legacy) {
        ambiguousFlags.push(q.id);
      } else if (n.option_keys.length > 0) {
        dupKeyEntries.push(`${q.id}=${n.option_keys.join('|')}`);
      }
    }
    const derived = [
      idx.mpiAnsweredCount > 0 ? idx.mpiScorePct : '',
      idx.mpiAnsweredCount > 0 ? (idx.isMpiPoor ? 'YES' : 'NO') : '',
      idx.mpiDeprivedItems.map((d) => d.qId).join('|'),
      idx.hhsAnsweredCount > 0 ? idx.hhsScore : '',
      idx.hhsAnsweredCount > 0 ? idx.hhsCategory : '',
      q14Norm.is_ambiguous_legacy ? 'AMBIGUOUS_CODE_0' : q14Norm.option_key ?? (s.answers.Q14?.optionKeys[0] ?? ''),
      q20Norm.is_ambiguous_legacy ? 'AMBIGUOUS_CODE_0' : q20Norm.option_key ?? (s.answers.Q20?.optionKeys[0] ?? ''),
      q14Norm.semantic_category,
      q20Norm.semantic_category,
      dupKeyEntries.join('; '),
      ambiguousFlags.join('|'),
    ];
    return [...base, ...qCells, ...derived].map(escapeCsvCell).join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}

export function buildSurveysExcelHtml(surveys: SurveyRecord[]): string {
  const rows = surveys
    .map(
      (s) => `
      <tr>
        <td>${escapeHtml(s.surveyCode)}</td>
        <td>${escapeHtml(s.profile.surveyDate)}</td>
        <td>${escapeHtml(lookupLabel(PART1_OPTIONS.b1Districts, s.profile.districtCode ?? '') || s.clusterName)}</td>
        <td>${escapeHtml(s.profile.headName)}</td>
        <td>${escapeHtml(s.profile.totalMembers)}</td>
        <td>${escapeHtml(s.profile.incomeBeforeApprox)}</td>
        <td>${escapeHtml(lookupLabel(PART1_OPTIONS.b9Income, s.profile.incomeNowCode))}</td>
        <td>${escapeHtml(s.status)}</td>
        <td>${escapeHtml(s.volunteerName)}</td>
      </tr>`
    )
    .join('');

  return `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
    <head><meta charset="utf-8" /></head>
    <body>
      <h2>Miles2Smile Foundation — Assam-Wide Evicted Households Socio-Economic Baseline</h2>
      <table border="1">
        <thead>
          <tr style="background:#FDC513;color:#181611;font-weight:bold;">
            <th>Survey ID</th><th>Date</th><th>District</th><th>Head of Household</th>
            <th>Family Size</th><th>Income Before</th><th>Income Now</th><th>Status</th><th>Volunteer</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>
  `;
}

export function triggerFileDownload(filename: string, content: BlobPart, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CRC32 table for valid Store-mode ZIP archive generation in browser
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function buildZipBlob(entries: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const stamp = dosDateTime();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); // store
    cv.setUint16(12, stamp.time, true);
    cv.setUint16(14, stamp.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.data.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...localParts, ...centralParts, eocd] as BlobPart[], { type: 'application/zip' });
}

export function downloadDocumentsZip(docs: HouseholdDocument[], zipFilename: string) {
  const encoder = new TextEncoder();
  const manifest = {
    exportedAt: new Date().toISOString(),
    study: 'M2S Field Survey — Lutumari Reserve Forest Eviction Study',
    documentCount: docs.length,
    privacyPolicy: 'Aadhaar numbers truncated to last 4 digits only',
    documents: docs.map((d) => ({
      id: d.id,
      surveyCode: d.surveyCode,
      headName: d.headName,
      clusterName: d.clusterName,
      docType: d.docType,
      aadhaarLast4: d.aadhaarLast4 ?? null,
      verificationStatus: d.verificationStatus,
      pages: d.pages.map((p) => ({ fileName: p.fileName, mime: p.mime, sizeBytes: p.sizeBytes })),
    })),
  };

  const entries: { name: string; data: Uint8Array }[] = [
    { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest, null, 2)) },
  ];

  for (const doc of docs) {
    for (const p of doc.pages) {
      const folder = `${doc.surveyCode}_${doc.headName.replace(/[^a-zA-Z0-9]+/g, '_')}`;
      const safeName = `${folder}/${doc.categoryId}_p${p.pageNo}_${p.fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')}.svg`;
      const decodedSvg = p.localPreviewUrl.startsWith('data:image/svg+xml;charset=utf-8,')
        ? decodeURIComponent(p.localPreviewUrl.replace('data:image/svg+xml;charset=utf-8,', ''))
        : `Document ${doc.docType} (${p.fileName}) for ${doc.surveyCode}`;
      entries.push({ name: safeName, data: encoder.encode(decodedSvg) });
    }
  }

  const blob = buildZipBlob(entries);
  triggerFileDownload(zipFilename, blob, 'application/zip');
}


/* ------------------------------------------------------------------ */
/* Generic tabular exports (CSV + a dependency-free .xlsx workbook)    */
/* ------------------------------------------------------------------ */

export type Cell = string | number | boolean | null | undefined | string[];

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens Hindi / ₹ correctly. */
export function buildCsv(rows: Cell[][]): string {
  return '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
}

/** "m2s-volunteers-2026-11-11.csv" */
export function exportFileName(base: string, ext: string): string {
  return `m2s-${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function downloadCsv(base: string, rows: Cell[][]): string {
  const name = exportFileName(base, 'csv');
  triggerFileDownload(name, buildCsv(rows), 'text/csv;charset=utf-8');
  return name;
}

export interface SheetSpec {
  /** Max 31 chars; []:*?/\ are replaced. */
  name: string;
  rows: Cell[][];
}

const xmlEsc = (s: string) =>
  s
    // strip characters that are illegal in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function colName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(rows: Cell[][]): string {
  const widths = new Map<number, number>();
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${colName(c)}${r + 1}`;
          const style = r === 0 ? ' s="1"' : '';
          const value = Array.isArray(v) ? v.join('|') : v;
          widths.set(c, Math.min(60, Math.max(widths.get(c) ?? 8, String(value ?? '').length + 2)));
          if (value === null || value === undefined || value === '') return '';
          if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
          if (typeof value === 'boolean') return `<c r="${ref}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(value))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const cols = [...widths.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, w]) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (rows.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : '') +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Builds a real Office Open XML workbook (.xlsx) with one sheet per spec, with no library:
 * an .xlsx is a ZIP of XML parts and buildZipBlob writes valid store-mode archives.
 */
export function buildXlsxBlob(sheets: SheetSpec[]): Blob {
  const enc = new TextEncoder();
  const used = new Set<string>();
  const names = sheets.map((s, i) => {
    let n = s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || `Sheet${i + 1}`;
    while (used.has(n.toLowerCase())) n = `${n.slice(0, 27)} ${i + 1}`;
    used.add(n.toLowerCase());
    return n;
  });
  const parts: { name: string; xml: string }[] = [
    {
      name: '[Content_Types].xml',
      xml:
        XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      xml:
        XML_HEAD +
        `<Relationships xmlns="${NS_PKG_REL}">` +
        `<Relationship Id="rId1" Type="${NS_DOC_REL}/officeDocument" Target="xl/workbook.xml"/>` +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      xml:
        XML_HEAD +
        `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_DOC_REL}">` +
        `<sheets>${names.map((n, i) => `<sheet name="${xmlEsc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml:
        XML_HEAD +
        `<Relationships xmlns="${NS_PKG_REL}">` +
        names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_DOC_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${names.length + 1}" Type="${NS_DOC_REL}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    {
      name: 'xl/styles.xml',
      xml:
        XML_HEAD +
        `<styleSheet xmlns="${NS_MAIN}">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF15804B"/><bgColor indexed="64"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, xml: sheetXml(s.rows) })),
  ];
  const zip = buildZipBlob(parts.map((p) => ({ name: p.name, data: enc.encode(p.xml) })));
  return new Blob([zip], { type: XLSX_MIME });
}

export function downloadXlsx(base: string, sheets: SheetSpec[]): string {
  const name = exportFileName(base, 'xlsx');
  triggerFileDownload(name, buildXlsxBlob(sheets), XLSX_MIME);
  return name;
}

export interface AnalyticsIndicatorRow {
  domain: string;
  indicator: string;
  affected: number;
  answered: number;
  missing: number;
  zeroCount?: number;
  pctOfAnswered: number;
}

export function buildAnalyticsReportSheets(input: {
  filterLabel: string;
  totalSurveys: number;
  indicators: AnalyticsIndicatorRow[];
  clusterRows: Cell[][];
  trendRows: Cell[][];
}): SheetSpec[] {
  return [
    {
      name: 'Summary & Missing vs Zero',
      rows: [
        ['Study', 'M2S Field Survey — Assam-Wide Evicted Households Baseline Survey'],
        ['Filter Scope', input.filterLabel],
        ['Sample Size (N)', input.totalSurveys],
        ['Note', 'Missing/Unanswered and semantic N/A [is_na] are counted separately from substantive Zero-coded answers (e.g. Q19/Q25a code 0 = None).'],
        [],
        ['Domain', 'Indicator', 'Affected (n)', 'Answered (denom)', 'Missing / Unanswered', 'Explicit Zero Value', '% of Answered'],
        ...input.indicators.map((r) => [
          r.domain,
          r.indicator,
          r.affected,
          r.answered,
          r.missing,
          r.zeroCount ?? '',
          `${r.pctOfAnswered}%`,
        ]),
      ],
    },
    {
      name: 'Cluster Comparison',
      rows: input.clusterRows,
    },
    {
      name: 'Completion Trends',
      rows: input.trendRows,
    },
  ];
}

export function buildCodebookRows(): Cell[][] {
  const rows: Cell[][] = [
    ['Item ID', 'Section', 'Type', 'Indicator / Source', 'Coding & Zero-Coding [0] Safeguard Rules', 'MPI Weight'],
  ];
  const mpiByQ = new Map(MPI_INDICATORS.map((m) => [m.qId, m.weightLabel]));
  for (const q of QUESTIONS) {
    const coding =
      q.type === 'text'
        ? 'Free text qualitative probe (Bilingual testimony)'
        : (q.options ?? []).map((o) => `[key:${o.key} | code:${o.code}] ${o.en}${o.tag ? ` (${o.tag})` : ''}`).join(' ; ');
    rows.push([
      q.id,
      `${q.section} (${q.sectionTitleEn})`,
      q.type === 'q40' ? 'Ranked Exact-2 (Priority 1 + Priority 2)' : q.type,
      `${q.indicator} — ${q.source}`,
      coding,
      mpiByQ.get(q.id) ?? '',
    ]);
  }
  return rows;
}

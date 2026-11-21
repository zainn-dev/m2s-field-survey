import { PART1_OPTIONS, QUESTIONS, STUDY_META } from '../data/questionnaire';
import { formatDocVerifiedLabels, parseDocVerifiedCodes } from '../survey/surveyModel';
import type { HouseholdDocument, Role, SurveyRecord } from '../types/survey';
import { evaluateHouseholdIndices } from './studyIndicators';
import { evaluateSurveyQuality } from './surveyQuality';

export interface CaseFilePdfOptions {
  survey: SurveyRecord;
  documents: HouseholdDocument[];
  peerSurveys?: SurveyRecord[];
  viewerRole: Role;
  generatedAt?: string;
}

const SENSITIVE_CASE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

function pdfSafeAscii(v: unknown): string {
  return String(v ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[—–]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxChars = 90): string[] {
  const clean = pdfSafeAscii(text);
  if (!clean) return [''];
  const words = clean.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur ? `${cur} ${w}` : w).length > maxChars) {
      if (cur) lines.push(cur);
      cur = w.length > maxChars ? `${w.slice(0, maxChars - 3)}...` : w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function optLabel(list: { code: string; en: string }[], code: string): string {
  return list.find((o) => o.code === code)?.en ?? code;
}

function buildTextPages(lines: { text: string; bold?: boolean; size?: number }[]): string[][] {
  const pages: string[][] = [[]];
  let y = 785;
  const minY = 50;

  for (const line of lines) {
    const size = line.size ?? 9.5;
    const step = size + 4;
    if (y - step < minY) {
      pages.push([]);
      y = 785;
    }
    const font = line.bold ? 'F2' : 'F1';
    pages[pages.length - 1].push(`BT /${font} ${size} Tf 45 ${y} Td (${pdfEscape(line.text)}) Tj ET`);
    y -= step;
  }
  return pages;
}

/**
 * Generates a real multi-page PDF binary (%PDF-1.4) Household Case File.
 * Masks Aadhaar to trailing 4 digits only and gates precise GPS / verifier detail by role.
 */
export function buildHouseholdCaseFilePdf({
  survey,
  documents,
  peerSurveys = [],
  viewerRole,
  generatedAt = new Date().toISOString(),
}: CaseFilePdfOptions): Uint8Array {
  const canSeeSensitiveMeta = SENSITIVE_CASE_ROLES.includes(viewerRole);
  const quality = evaluateSurveyQuality({ survey, documents, peerSurveys });
  const indices = evaluateHouseholdIndices(survey);
  const hhDocs = documents.filter((d) => d.householdId === survey.householdId);
  const lines: { text: string; bold?: boolean; size?: number }[] = [];

  const heading = (t: string) => {
    lines.push({ text: '', size: 6 });
    lines.push({ text: t, bold: true, size: 11.5 });
    lines.push({ text: '-'.repeat(88), size: 8 });
  };
  const addWrapped = (prefix: string, body: string, bold = false) => {
    const wrapped = wrapLine(`${prefix}${body}`, 90);
    wrapped.forEach((w, idx) => lines.push({ text: idx === 0 ? w : `    ${w}`, bold: bold && idx === 0, size: 9 }));
  };

  lines.push({ text: `${STUDY_META.organization} - Household Case File`, bold: true, size: 14 });
  lines.push({ text: STUDY_META.studyTitle, size: 9.5 });
  lines.push({
    text: `Survey Code: ${survey.surveyCode} | Status: ${survey.status} | Generated: ${generatedAt.slice(0, 19).replace('T', ' ')} UTC`,
    size: 8.5,
  });

  heading('1. Survey Metadata & Consent Record');
  addWrapped('Household ID: ', survey.householdId);
  addWrapped('Cluster / Camp: ', `${survey.clusterName} (${survey.clusterId})`);
  addWrapped('District & Village (B1): ', `${optLabel(PART1_OPTIONS.b1Districts, survey.profile.districtCode ?? '')}${survey.profile.districtOther ? ` (${survey.profile.districtOther})` : ''} | ${survey.profile.revenueCircleVillage || '-'}`);
  addWrapped('Field Volunteer: ', survey.volunteerName || '—');
  addWrapped('Revision / Timestamps: ', `Rev ${survey.revision} | Created ${survey.createdAt.slice(0, 10)} | Submitted ${survey.submittedAt?.slice(0, 10) ?? 'Draft'}`);
  addWrapped('Interview Duration: ', survey.durationSec ? `${survey.durationSec} seconds` : 'Not recorded');
  addWrapped('Verbal Survey Consent: ', survey.consentGiven ? 'GRANTED by respondent' : 'NOT RECORDED');
  addWrapped('Document Photo Consent: ', survey.profile.docPhotoConsent ? 'GRANTED' : 'Not recorded');
  addWrapped(
    'GPS Consent & Coordinates: ',
    !survey.gpsConsent
      ? 'Not consented / not collected (Permission: ' + (survey.gpsPermissionStatus ?? 'unset') + ')'
      : canSeeSensitiveMeta && survey.gpsLat != null && survey.gpsLng != null
      ? `CONSENTED - Lat ${survey.gpsLat.toFixed(6)}, Lng ${survey.gpsLng.toFixed(6)} (+/-${Math.round(survey.gpsAccuracyMeters ?? 0)}m at ${survey.gpsCapturedAt ?? 'N/A'})`
      : 'CONSENTED (Coordinates restricted to authorized Admin/Supervisor roles)'
  );
  addWrapped('Quality Completeness Score: ', `${quality.completenessScore}% (${quality.answeredRequired}/${quality.totalRequired} mandatory items)`);

  heading('1A. Composite Indices (National MPI & Food Hunger Scale)');
  addWrapped(
    'UNDP/NITI Aayog MPI (12 indicators): ',
    `${indices.mpiScorePct}% - ${indices.mpiBandLabel} (${indices.mpiDeprivedCount}/${indices.mpiAnsweredCount || 12} deprived)`
  );
  if (indices.mpiDeprivedItems.length > 0) {
    addWrapped(
      'Deprived MPI Items: ',
      indices.mpiDeprivedItems.map((d) => `${d.qId} ${d.label} [${d.weightLabel}]`).join('; ')
    );
  }
  addWrapped(
    'Household Hunger Scale (Q11): ',
    `${indices.hhsScore} / 6 - ${indices.hhsCategory}`
  );
  const flags: string[] = [];
  if (indices.pre1971Settlement) flags.push('Assam Accord Pre-1971 Resident (Q1a)');
  if (indices.zeroCashIncome) flags.push('Destitute / Zero Cash Income (B9 / Q22)');
  if (indices.tookInformalDebt) flags.push('Post-Eviction Informal Debt (Q20)');
  if (indices.dueProcessBreach) flags.push('Due Process Notice Violation (Q4)');
  if (indices.genderedWashAcute) flags.push('Women WASH/Menstrual Privacy Deficit (Q16)');
  if (indices.hasTouziOrPatta) flags.push('Holds Patta / Forest Claim / Touzi (B10)');
  if (indices.idLostOrBuried) flags.push('Identity/NRC Docs Lost/Damaged (Q24)');
  if (indices.pdsBlocked) flags.push('PDS / Welfare Scheme Blocked (Q25b)');
  addWrapped('Protection & Legal Flags: ', flags.length ? flags.join(' | ') : 'None flagged');

  heading('2. Household Profile (Part I: B1-B10)');
  addWrapped('Head of Household (B3): ', `${survey.profile.headName || 'Unnamed'} (Age ${survey.profile.headAge || 'N/A'}) - ${optLabel(PART1_OPTIONS.b3HeadStatus, survey.profile.headStatusCode)}`);
  addWrapped('Religion / Caste (B6-B7): ', `${optLabel(PART1_OPTIONS.b6Religion, survey.profile.religionCode)} | ${survey.profile.casteName || '-'} | ${optLabel(PART1_OPTIONS.b7CasteCategory, survey.profile.casteCategoryCode)}`);
  addWrapped('Primary Language (B8): ', optLabel(PART1_OPTIONS.b8Language, survey.profile.primaryLanguageCode));
  addWrapped(
    'Verified Document (B2): ',
    `${survey.profile.docVerifiedLabel || formatDocVerifiedLabels(parseDocVerifiedCodes(survey.profile.docVerifiedCode), 'en') || '-'}${
      survey.profile.idLast4 ? ` (Masked ID: XXXX-XXXX-${survey.profile.idLast4})` : ''
    }`
  );
  addWrapped(
    'Family Composition (B4): ',
    `Total ${survey.profile.totalMembers} (M: ${survey.profile.maleCount}, F: ${survey.profile.femaleCount}, Other: ${survey.profile.otherGenderCount}) | <1y: ${survey.profile.ageUnder1 ?? 0}, 1-5y: ${survey.profile.age1to5 ?? survey.profile.age0to5}, 6-14: ${survey.profile.age6to14}, 15-17: ${survey.profile.age15to17}, 18-59: ${survey.profile.age18to59}, 60+: ${survey.profile.age60Plus}`
  );
  addWrapped('Monthly Income Before -> Now (B9): ', `${survey.profile.incomeBeforeApprox || '-'} -> ${optLabel(PART1_OPTIONS.b9Income, survey.profile.incomeNowCode)}`);
  addWrapped(
    'Land Ownership (B10): ',
    `${optLabel(PART1_OPTIONS.b10LandOwned, survey.profile.landOwnedCode ?? '')}${
      survey.profile.landOwnedCode === '1'
        ? ` | ${survey.profile.landBighas || optLabel(PART1_OPTIONS.b10LandSize, survey.profile.landSizeCode ?? '')} | ${optLabel(PART1_OPTIONS.b10LandDocType, survey.profile.landDocTypeCode ?? '')}`
        : ''
    }`
  );

  heading('3. Document Index (Private Storage - Full Aadhaar Redacted)');
  if (hhDocs.length === 0) {
    addWrapped('Documents: ', 'No documents indexed for this household.');
  } else {
    for (const d of hhDocs) {
      const aadhaarNote = d.aadhaarLast4 ? ` | Aadhaar Last-4: XXXX-${d.aadhaarLast4}` : '';
      const roleNote = canSeeSensitiveMeta && d.rejectionReason ? ` | Reviewer Note: ${d.rejectionReason}` : '';
      const verifier = canSeeSensitiveMeta && d.verifiedByName ? ` | Verified by ${d.verifiedByName}` : '';
      addWrapped(`- ${d.docType}: `, `${d.verificationStatus} | Pages: ${d.pages.length}${aadhaarNote}${verifier}${roleNote}`);
    }
  }

  heading('4. Review History & Quality Advisories');
  if (survey.reviews.length === 0) {
    addWrapped('Reviews: ', 'No supervisor reviews logged yet.');
  } else {
    for (const r of survey.reviews) {
      addWrapped(`- ${r.decision} (${r.createdAt.slice(0, 10)}): `, `${r.reviewerName} (${r.reviewerRole}) - ${r.reason || 'Approved without remarks'}`);
    }
  }
  for (const issue of quality.issues.slice(0, 12)) {
    addWrapped(`[${issue.severity.toUpperCase()}] `, `${issue.title}: ${issue.detail}`);
  }

  heading('5. Survey Responses (Part II & III: Q1a-Q28)');
  for (const q of QUESTIONS) {
    const ans = survey.answers[q.id];
    let ansText = 'Not answered';
    if (ans) {
      if (q.type === 'text' || q.type === 'date') {
        ansText = ans.otherText?.trim() || 'Not answered';
      } else if (ans.optionKeys.length > 0) {
        const labels = ans.optionKeys.map((k) => {
          const opt = q.options?.find((o) => o.key === k);
          return opt ? `[${opt.code}] ${opt.en}` : k;
        });
        ansText = labels.join(' ; ') + (ans.otherText ? ` (Note: ${ans.otherText})` : '');
      }
    }
    addWrapped(`${q.id}: `, `${q.en} => ${ansText}`);
  }

  // Assemble valid PDF 1.4 object stream
  const contentPages = buildTextPages(lines);
  const objects: string[] = [];
  const addObj = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalogId = addObj(''); // placeholder 1
  const pagesId = addObj(''); // placeholder 2
  const fontRegularId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontBoldId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  const pageIds: number[] = [];
  contentPages.forEach((streamLines, idx) => {
    const footer = `BT /F1 8 Tf 45 30 Td (Miles2Smile Case File - ${pdfEscape(survey.surveyCode)} - Page ${idx + 1} of ${contentPages.length}) Tj ET`;
    const streamData = [...streamLines, footer].join('\n');
    const contentId = addObj(`<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream`);
    const pageId = addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((body, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

export function buildHouseholdCaseFilePdfBlob(opts: CaseFilePdfOptions): Blob {
  return new Blob([buildHouseholdCaseFilePdf(opts) as BlobPart], { type: 'application/pdf' });
}

import { describe, expect, it } from 'vitest';
import {
  buildCsv,
  buildSurveysCsv,
  buildSurveysExcelHtml,
  buildXlsxBlob,
  buildZipBlob,
} from '../src/utils/exportHelpers';
import { createEmptyProfile } from '../src/data/questionnaire';
import type { SurveyRecord } from '../src/types/survey';

function makeSurvey(overrides: Partial<SurveyRecord> = {}): SurveyRecord {
  const profile = createEmptyProfile('M2S-001001', 'Talha');
  profile.headName = '=HYPERLINK("http://evil.example","Click")';
  return {
    id: 'srv-1',
    householdId: 'hh-1',
    surveyCode: 'M2S-001001',
    clusterId: 'kandapara',
    clusterName: 'Kandapara',
    volunteerId: 'vol-1',
    volunteerName: 'Talha Tanweer',
    status: 'SUBMITTED',
    revision: 1,
    consentGiven: true,
    profile,
    answers: {
      Q1a: { questionId: 'Q1a', optionKeys: ['1'], optionCodes: ['1'] },
      Q28: { questionId: 'Q28', optionKeys: [], optionCodes: [], otherText: '+12345; <script>alert(1)</script>' },
    },
    reviews: [],
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:05:00.000Z',
    submittedAt: '2026-11-10T10:05:00.000Z',
    ...overrides,
  };
}

describe('exportHelpers', () => {
  it('buildCsv emits UTF-8 BOM and neutralizes Excel formula injection prefixes', () => {
    const out = buildCsv([
      ['Name', 'Formula', 'Negative', 'At', 'Tab', 'Quoted'],
      ['Normal', '=SUM(A1:A2)', '-1+1', '@CMD', '\tcmd', 'Hello, "World"'],
    ]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    const lines = out.slice(1).split('\r\n');
    expect(lines[1]).toBe(`Normal,'=SUM(A1:A2),'-1+1,'@CMD,'\tcmd,"Hello, ""World"""`);
  });

  it('buildSurveysCsv masks Aadhaar to last 4 digits and prefixes dangerous formulas', () => {
    const s = makeSurvey();
    s.profile.idLast4 = '4321';
    const csv = buildSurveysCsv([s]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('XXXX-4321');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""Click"")"`);
    expect(csv).toContain(`'+12345; <script>alert(1)</script>`);
  });

  it('buildSurveysExcelHtml escapes HTML special characters cleanly', () => {
    const s = makeSurvey();
    s.profile.headName = '<img src=x onerror=alert(1)>';
    const html = buildSurveysExcelHtml([s]);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('buildSurveysCsv preserves semantic option_key distinction for Q14 (water) and Q20 (bank/debt)', () => {
    const deprivedDebt = makeSurvey({
      id: 's-safe',
      surveyCode: 'M2S-002001',
      answers: {
        Q14: { questionId: 'Q14', optionKeys: ['1'], optionCodes: ['1'] },
        Q20: { questionId: 'Q20', optionKeys: ['2'], optionCodes: ['2'] },
      },
    });
    const deprivedNoDebt = makeSurvey({
      id: 's-na',
      surveyCode: 'M2S-002002',
      answers: {
        Q14: { questionId: 'Q14', optionKeys: ['3'], optionCodes: ['3'] },
        Q20: { questionId: 'Q20', optionKeys: ['1'], optionCodes: ['1'] },
      },
    });
    const csv = buildSurveysCsv([deprivedDebt, deprivedNoDebt]);
    expect(csv).toContain('Q14 Drinking Water OptionKey');
    expect(csv).toContain('Q20 Bank/Debt OptionKey');
    expect(csv).toContain('Q14 Semantic Category');
    expect(csv).toContain('Q20 Semantic Category');
    expect(csv).toContain('safe_water_available');
    expect(csv).toContain('unsafe_water_deprived');
    expect(csv).toContain('informal_debt_trap');
    expect(csv).toContain('active_bank_no_new_debt');
  });

  it('buildZipBlob and buildXlsxBlob generate valid ZIP / OOXML containers', async () => {
    const enc = new TextEncoder();
    const zipBlob = buildZipBlob([{ name: 'hello.txt', data: enc.encode('namaste') }]);
    const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
    expect(Array.from(zipBytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const xlsxBlob = buildXlsxBlob([
      { name: 'Summary: Study/2026 [Very Long Name]', rows: [['Cluster', 'Done'], ['Kandapara', 12]] },
      { name: 'Summary: Study/2026 [Very Long Name]', rows: [['A', 'B']] },
    ]);
    expect(xlsxBlob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const xlsxBytes = new Uint8Array(await xlsxBlob.arrayBuffer());
    expect(Array.from(xlsxBytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const rawText = new TextDecoder('latin1').decode(xlsxBytes);
    expect(rawText).toContain('[Content_Types].xml');
    expect(rawText).toContain('xl/workbook.xml');
    expect(rawText).toContain('xl/worksheets/sheet1.xml');
    expect(rawText).toContain('xl/worksheets/sheet2.xml');
  });
});

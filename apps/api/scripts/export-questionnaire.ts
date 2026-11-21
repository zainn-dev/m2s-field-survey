// Writes questionnaire/questionnaire.v1.json from the app's questionnaire definition (apps/web/src/data/questionnaire.ts),
// which was transcribed from the supplied DOCX. The API validates answers against this JSON, so web and API never drift.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PART1_LABELS, PART1_OPTIONS, QUESTIONS, STUDY_META, SURVEY_SECTIONS } from '../../../packages/shared/src/data/questionnaire';

const out = join(__dirname, '..', '..', '..', 'questionnaire', 'questionnaire.v1.json');
const definition = {
  version: STUDY_META.version,
  study: STUDY_META,
  part1: { labels: PART1_LABELS, options: PART1_OPTIONS },
  sections: SURVEY_SECTIONS,
  questions: QUESTIONS.map((q) => ({
    id: q.id,
    section: q.section,
    type: q.type,
    en: q.en,
    hi: q.hi,
    indicator: q.indicator,
    source: q.source,
    options: q.options?.map((o) => ({
      key: o.key,
      code: o.code,
      en: o.en,
      hi: o.hi,
      ...(o.tag ? { tag: o.tag } : {}),
      ...(o.specifyText ? { specifyText: true } : {}),
      ...(o.exclusive ? { exclusive: true } : {}),
    })),
    ...(q.alwaysShowDetailInput ? { alwaysShowDetailInput: true } : {}),
    ...(q.detailPromptEn ? { detailPromptEn: q.detailPromptEn } : {}),
    ...(q.detailPromptHi ? { detailPromptHi: q.detailPromptHi } : {}),
    ...(q.photoHintEn ? { photoHintEn: q.photoHintEn } : {}),
    ...(q.photoHintHi ? { photoHintHi: q.photoHintHi } : {}),
  })),
};
writeFileSync(out, JSON.stringify(definition, null, 2) + '\n');
console.log(`Wrote ${QUESTIONS.length} questions to ${out}`);

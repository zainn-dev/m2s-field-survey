// Reference data needed in every environment (safe to re-run):
//  - questionnaire version (from questionnaire/questionnaire.v1.json; a new version only if the file changed)
//  - village clusters (B2 options of the questionnaire)
//  - document categories
// It never creates users. Use `npm run bootstrap-admin` for the first account.
import '../src/env';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const CLUSTERS = [
  { id: 'kandapara', code: 'CL-01', name: 'Kandapara', targetHouseholds: 25, mapX: 27, mapY: 50 },
  { id: 'chankhula', code: 'CL-02', name: 'Chankhula', targetHouseholds: 15, mapX: 25, mapY: 27 },
  { id: 'majgaon', code: 'CL-03', name: 'Majgaon', targetHouseholds: 15, mapX: 50, mapY: 22 },
  { id: 'kadomoni', code: 'CL-04', name: 'Kadomoni', targetHouseholds: 10, mapX: 70, mapY: 46 },
  { id: 'juripar', code: 'CL-05', name: 'Juripar', targetHouseholds: 10, mapX: 52, mapY: 64 },
  { id: 'bedari-par', code: 'CL-06', name: 'Bedari Par', targetHouseholds: 10, mapX: 68, mapY: 83 },
  { id: 'nim-bagan', code: 'CL-07', name: 'Nim Bagan', targetHouseholds: 5, mapX: 29, mapY: 79 },
  // B2 "Other": households from outside the seven listed clusters. Hidden from progress/map widgets.
  { id: 'other', code: 'CL-00', name: 'Other', targetHouseholds: 0, mapX: 50, mapY: 50, active: false },
];

const DOC_CATEGORIES = [
  { id: 'aadhaar', label: 'Aadhaar Card', labelHi: 'आधार कार्ड', requiresLast4: true, enabled: true },
  { id: 'voter_id', label: 'Voter ID / EPIC', labelHi: 'वोटर आईडी कार्ड', enabled: true },
  { id: 'ration_card', label: 'NFSA Ration Card', labelHi: 'राशन कार्ड', enabled: true },
  { id: 'nrc_legacy', label: 'NRC ARN / Pre-1971 Legacy Record', labelHi: 'एनआरसी रसीद / 1971-पूर्व रिकॉर्ड', enabled: true },
  { id: 'eviction_notice', label: 'Eviction Notice / Court Proof', labelHi: 'बेदखली नोटिस / कोर्ट प्रमाण', enabled: true },
  { id: 'land_records', label: 'Patta / Land Records', labelHi: 'पट्टा / भूमि अभिलेख', enabled: true },
  { id: 'family_photo', label: 'Family Photograph', labelHi: 'परिवार की तस्वीर', enabled: true },
  { id: 'other', label: 'Other Documents', labelHi: 'अन्य दस्तावेज़', enabled: true },
];

(async () => {
  const db = new PrismaClient();
  const candidates = [
    process.env.QUESTIONNAIRE_JSON,
    join(__dirname, '..', '..', '..', 'questionnaire', 'questionnaire.v1.json'),
    join(__dirname, '..', '..', '..', '..', 'questionnaire', 'questionnaire.v1.json'),
  ].filter((p): p is string => Boolean(p));
  const file = candidates.find((p) => existsSync(p)) ?? candidates[0];
  if (!existsSync(file)) throw new Error(`Missing ${file}. Run: npm run questionnaire:export`);
  const raw = readFileSync(file, 'utf8');
  const sha = createHash('sha256').update(raw).digest('hex');
  const latest = await db.questionnaireVersion.findFirst({ orderBy: { version: 'desc' } });
  if (latest?.sourceSha256 === sha) {
    console.log(`Questionnaire v${latest.version} already current.`);
  } else {
    const version = (latest?.version ?? 0) + 1;
    await db.questionnaireVersion.create({ data: { version, definition: JSON.parse(raw), sourceSha256: sha } });
    console.log(`Seeded questionnaire version ${version}.`);
  }

  for (const c of CLUSTERS) {
    await db.cluster.upsert({ where: { id: c.id }, create: { active: true, ...c }, update: {} });
  }
  console.log(`Clusters ready (${CLUSTERS.length}).`);

  if (!(await db.setting.findUnique({ where: { key: 'docCategories' } }))) {
    await db.setting.create({ data: { key: 'docCategories', value: DOC_CATEGORIES } });
    console.log('Document categories seeded.');
  }
  await db.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

import {
  AuditEvent,
  ClusterItem,
  HouseholdDocument,
  NotificationItem,
  QuestionAnswer,
  SurveyRecord,
  SurveyStatus,
  UserAccount,
} from '../../../../packages/shared/src/types/survey';
import { QUESTIONS } from '../../../../packages/shared/src/data/questionnaire';
import { generateDocumentMockPreview } from './docThumbnails';

export const INITIAL_CLUSTERS: ClusterItem[] = [
  { id: 'kandapara', code: 'CL-01', name: 'Kandapara', targetHouseholds: 25, mapX: 27, mapY: 50, active: true },
  { id: 'chankhula', code: 'CL-02', name: 'Chankhula', targetHouseholds: 15, mapX: 25, mapY: 27, active: true },
  { id: 'majgaon', code: 'CL-03', name: 'Majgaon', targetHouseholds: 15, mapX: 50, mapY: 22, active: true },
  { id: 'kadomoni', code: 'CL-04', name: 'Kadomoni', targetHouseholds: 10, mapX: 70, mapY: 46, active: true },
  { id: 'juripar', code: 'CL-05', name: 'Juripar', targetHouseholds: 10, mapX: 52, mapY: 64, active: true },
  { id: 'bedari-par', code: 'CL-06', name: 'Bedari Par', targetHouseholds: 10, mapX: 68, mapY: 83, active: true },
  { id: 'nim-bagan', code: 'CL-07', name: 'Nim Bagan', targetHouseholds: 5, mapX: 29, mapY: 79, active: true },
];

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'u-admin-1',
    name: 'Aasif Mujtaba',
    email: 'aasif@miles2smile.org',
    mobile: '9811001122',
    role: 'ADMIN',
    assignedClusterIds: INITIAL_CLUSTERS.map((c) => c.id),
    active: true,
    lastActive: '2026-11-11T12:45:00Z',
  },
  {
    id: 'u-sup-1',
    name: 'Dr. Samta Pandya',
    email: 'samta.pandya@tiss.edu',
    mobile: '9820112233',
    role: 'SUPERVISOR',
    assignedClusterIds: INITIAL_CLUSTERS.map((c) => c.id),
    active: true,
    lastActive: '2026-11-11T11:20:00Z',
  },
  {
    id: 'u-vol-1',
    name: 'Talha Tanweer',
    email: 'talha@miles2smile.org',
    mobile: '9876543210',
    role: 'VOLUNTEER',
    assignedClusterIds: ['kandapara', 'chankhula'],
    active: true,
    lastActive: '2026-11-11T12:50:00Z',
    targetHouseholds: 20,
  },
  {
    id: 'u-vol-2',
    name: 'Jagrit Yadav',
    email: 'jagrit@miles2smile.org',
    mobile: '9876501122',
    role: 'VOLUNTEER',
    assignedClusterIds: ['majgaon', 'kadomoni'],
    active: true,
    lastActive: '2026-11-11T12:15:00Z',
    targetHouseholds: 20,
  },
  {
    id: 'u-vol-3',
    name: 'Chaitanya Janrode',
    email: 'chaitanya@miles2smile.org',
    mobile: '9876502233',
    role: 'VOLUNTEER',
    assignedClusterIds: ['juripar', 'bedari-par'],
    active: true,
    lastActive: '2026-11-11T11:45:00Z',
    targetHouseholds: 15,
  },
  {
    id: 'u-vol-4',
    name: 'Rashid Ali',
    email: 'rashid.ali@miles2smile.org',
    mobile: '9876543211',
    role: 'VOLUNTEER',
    assignedClusterIds: ['kandapara'],
    active: true,
    lastActive: '2026-11-11T10:30:00Z',
    targetHouseholds: 15,
  },
  {
    id: 'u-vol-5',
    name: 'Sara Khan',
    email: 'sara.khan@miles2smile.org',
    mobile: '9123456780',
    role: 'VOLUNTEER',
    assignedClusterIds: ['chankhula', 'nim-bagan'],
    active: true,
    lastActive: '2026-11-11T09:50:00Z',
    targetHouseholds: 15,
  },
  {
    id: 'u-vol-6',
    name: 'Farhana Begum',
    email: 'farhana@miles2smile.org',
    mobile: '9812345670',
    role: 'VOLUNTEER',
    assignedClusterIds: ['majgaon', 'kadomoni'],
    active: true,
    lastActive: '2026-11-10T17:40:00Z',
    targetHouseholds: 15,
  },
  {
    id: 'u-vol-7',
    name: 'Imran Sheikh',
    email: 'imran.sheikh@miles2smile.org',
    mobile: '9988776655',
    role: 'VOLUNTEER',
    assignedClusterIds: ['bedari-par'],
    active: true,
    lastActive: '2026-11-09T14:20:00Z',
    targetHouseholds: 10,
  },
];

interface SeedTemplate {
  codeNum: number;
  headName: string;
  clusterId: string;
  status: SurveyStatus;
  volunteerId: string;
  familySize: number;
  incomeBefore: string;
  incomeBeforeExact: string;
  incomeNow: string;
  date: string;
  last4: string;
  caste: string;
  age: number;
  hungerLevel: '0' | '1' | '2';
}

// Top 4 featured entries match the dashboard showcase; remaining 51 bring totals to:
// 40 Approved (Completed), 12 Submitted (Pending Review), 3 Drafts = 55 surveys
const FEATURED_SEED: SeedTemplate[] = [
  { codeNum: 1245, headName: 'Aftab Khan', clusterId: 'kandapara', status: 'SUBMITTED', volunteerId: 'u-vol-1', familySize: 5, incomeBefore: '3', incomeBeforeExact: '12000', incomeNow: '3', date: '2026-11-09', last4: '4821', caste: 'Bengali Muslim / Miya', age: 42, hungerLevel: '1' },
  { codeNum: 1244, headName: 'Nurjahan Begum', clusterId: 'chankhula', status: 'APPROVED', volunteerId: 'u-vol-1', familySize: 7, incomeBefore: '2', incomeBeforeExact: '10000', incomeNow: '1', date: '2026-11-08', last4: '3910', caste: 'Bengali Muslim / Miya', age: 38, hungerLevel: '2' },
  { codeNum: 1243, headName: 'Salim Ali', clusterId: 'majgaon', status: 'APPROVED', volunteerId: 'u-vol-2', familySize: 6, incomeBefore: '3', incomeBeforeExact: '15000', incomeNow: '3', date: '2026-11-08', last4: '7742', caste: 'Goria', age: 49, hungerLevel: '1' },
  { codeNum: 1242, headName: 'Rehana Khatun', clusterId: 'kadomoni', status: 'DRAFT', volunteerId: 'u-vol-2', familySize: 4, incomeBefore: '2', incomeBeforeExact: '8000', incomeNow: '2', date: '2026-11-07', last4: '1290', caste: 'Bengali Muslim / Miya', age: 34, hungerLevel: '1' },
  { codeNum: 1241, headName: 'Abdul Karim', clusterId: 'juripar', status: 'SUBMITTED', volunteerId: 'u-vol-3', familySize: 6, incomeBefore: '3', incomeBeforeExact: '12000', incomeNow: '1', date: '2026-11-07', last4: '5519', caste: 'Deshi', age: 51, hungerLevel: '2' },
  { codeNum: 1240, headName: 'Momena Bibi', clusterId: 'bedari-par', status: 'SUBMITTED', volunteerId: 'u-vol-3', familySize: 5, incomeBefore: '2', incomeBeforeExact: '9000', incomeNow: '2', date: '2026-11-07', last4: '6043', caste: 'Bengali Muslim / Miya', age: 45, hungerLevel: '1' },
  { codeNum: 1239, headName: 'Biren Teron', clusterId: 'nim-bagan', status: 'APPROVED', volunteerId: 'u-vol-5', familySize: 4, incomeBefore: '2', incomeBeforeExact: '8500', incomeNow: '2', date: '2026-11-06', last4: '8314', caste: 'Karbi', age: 40, hungerLevel: '0' },
  { codeNum: 1238, headName: 'Raju Pator', clusterId: 'kandapara', status: 'DRAFT', volunteerId: 'u-vol-1', familySize: 5, incomeBefore: '3', incomeBeforeExact: '11000', incomeNow: '2', date: '2026-11-06', last4: '2187', caste: 'Tiwa', age: 36, hungerLevel: '1' },
  { codeNum: 1237, headName: 'Hasina Banu', clusterId: 'kandapara', status: 'DRAFT', volunteerId: 'u-vol-1', familySize: 3, incomeBefore: '1', incomeBeforeExact: '5000', incomeNow: '1', date: '2026-11-06', last4: '9402', caste: 'Bengali Muslim / Miya', age: 29, hungerLevel: '2' },
  { codeNum: 1236, headName: 'Jaharul Islam', clusterId: 'chankhula', status: 'SUBMITTED', volunteerId: 'u-vol-5', familySize: 8, incomeBefore: '4', incomeBeforeExact: '18000', incomeNow: '2', date: '2026-11-06', last4: '4498', caste: 'Bengali Muslim / Miya', age: 55, hungerLevel: '1' },
];

const EXTRA_NAMES = [
  'Rafiqul Islam', 'Asma Khatun', 'Hafizur Rahman', 'Subhan Ali', 'Sufia Begum',
  'Dilwar Hussain', 'Kanak Das', 'Nirmala Devi', 'Shafiqul Haque', 'Monowara Begum',
  'Kamal Uddin', 'Razia Sultana', 'Fakhrul Islam', 'Jiten Rongpi', 'Babulal Boro',
  'Anwara Begum', 'Tarikul Islam', 'Majibur Rahman', 'Dipali Sarkar', 'Sirajul Haque',
  'Roshonara Bibi', 'Noor Mohammad', 'Pankaj Kalita', 'Samsul Alam', 'Khadija Khatun',
  'Inamul Haque', 'Amina Begum', 'Lutfar Rahman', 'Sumitra Das', 'Ikbal Hussain',
  'Zakia Sultana', 'Azizur Rahman', 'Hemanta Das', 'Farida Yasmin', 'Sahidul Islam',
  'Rumi Begum', 'Nasir Uddin', 'Bimala Teronpi', 'Mominul Haque', 'Shabnam Ara',
  'Gias Uddin', 'Taslima Begum', 'Harun Al Rashid', 'Mukul Mandal', 'Rezia Khatun',
];

function buildAnswersForHousehold(seed: SeedTemplate, idx: number): Record<string, QuestionAnswer> {
  const answers: Record<string, QuestionAnswer> = {};
  const isDraft = seed.status === 'DRAFT';

  // Deterministic realistic deprivation patterns across approved surveys
  // Education ~48%, Health & Hunger ~62%, Living Standards ~55%, Livelihood ~40%
  const eduDeprived = idx % 25 < 12; // 48%
  const healthDeprived = idx % 25 < 15 || idx % 13 === 0; // ~62%
  const livingDeprived = idx % 20 < 11; // 55%
  const livelihoodDeprived = idx % 10 < 4; // 40%

  for (const q of QUESTIONS) {
    const qNum = parseInt(q.id.slice(1), 10);
    if (isDraft && qNum > 15) continue;

    if (q.type === 'text') {
      const sampleTexts: Record<string, string> = {
        Q26: 'When eviction squad arrived before dawn, we saved Aadhaar, ration card, and children school books in plastic sheets; spent initial nights under tarpaulin.',
        Q27: 'Women and adolescent girls face acute privacy issues at night without enclosed toilets; infants and elderly suffer on damp ground.',
        Q28: 'Surviving on irregular daily wage work, Miles2Smile food kit relief, and neighbour mutual aid with raised bamboo bedding platforms.',
      };
      answers[q.id] = {
        questionId: q.id,
        optionKeys: [],
        optionCodes: [],
        otherText: sampleTexts[q.id] || 'Community mutual aid and temporary shelter support.',
      };
    } else if (q.type === 'date') {
      answers[q.id] = {
        questionId: q.id,
        optionKeys: [],
        optionCodes: [],
        otherText: '2025-07-12',
      };
    } else if (q.options && q.options.length > 0) {
      let chosen = q.options[idx % q.options.length];
      if (q.id === 'Q6') {
        chosen = q.options.find((o) => o.code === (eduDeprived ? '1' : '3')) ?? q.options[0];
      } else if (q.id === 'Q7') {
        chosen = q.options.find((o) => o.code === (eduDeprived ? '2' : '1')) ?? q.options[0];
      } else if (q.id === 'Q9') {
        chosen = q.options.find((o) => o.code === (healthDeprived ? '2' : '1')) ?? q.options[0];
      } else if (q.id === 'Q11') {
        const hungerCode = healthDeprived ? (seed.hungerLevel === '2' ? '3' : '2') : '1';
        chosen = q.options.find((o) => o.code === hungerCode) ?? q.options[0];
      } else if (q.id === 'Q13' || q.id === 'Q14' || q.id === 'Q15' || q.id === 'Q17' || q.id === 'Q18' || q.id === 'Q19' || q.id === 'Q20') {
        chosen = q.options.find((o) => o.code === (livingDeprived ? '2' : '1')) ?? q.options[0];
      } else if (q.id === 'Q22') {
        chosen = q.options.find((o) => o.code === (livelihoodDeprived ? '4' : '1')) ?? q.options[0];
      } else if (q.id === 'Q1a') {
        chosen = q.options[idx % 4];
      } else if (q.id === 'Q4' || q.id === 'Q5') {
        chosen = q.options[idx % 3];
      } else if (chosen.exclusive) {
        chosen = q.options[0];
      }
      answers[q.id] = {
        questionId: q.id,
        optionKeys: [chosen.key],
        optionCodes: [chosen.code],
        ...(chosen.specifyText ? { otherText: `${chosen.en} (documented during field visit)` } : {}),
      };
    }
  }
  return answers;
}

function buildSurveyFromTemplate(t: SeedTemplate, idx: number): SurveyRecord {
  const cluster = INITIAL_CLUSTERS.find((c) => c.id === t.clusterId) ?? INITIAL_CLUSTERS[0];
  const volunteer = INITIAL_USERS.find((u) => u.id === t.volunteerId) ?? INITIAL_USERS[2];
  const surveyCode = `M2S-${String(t.codeNum).padStart(6, '0')}`;
  const children0to5 = t.familySize >= 5 ? 1 : 0;
  const children6to14 = t.familySize >= 4 ? 2 : 1;
  const elderly = t.age >= 55 ? 1 : 0;
  const adults = Math.max(1, t.familySize - children0to5 - children6to14 - elderly);

  return {
    id: `srv-${t.codeNum}`,
    householdId: `hh-${t.codeNum}`,
    surveyCode,
    clusterId: cluster.id,
    clusterName: cluster.name,
    volunteerId: volunteer.id,
    volunteerName: volunteer.name,
    status: t.status,
    revision: t.status === 'APPROVED' ? 2 : 1,
    consentGiven: true,
    profile: {
      surveyCode: `LUT-${String(t.codeNum).padStart(6, '0')}`,
      surveyDate: t.date,
      interviewer: volunteer.name.split(' ')[0],
      translator: idx % 2 === 0 ? 'Local Camp Coordinator' : '',
      clusterId: cluster.id,
      clusterName: cluster.name,
      clusterOther: '',
      districtCode: '1',
      districtOther: '',
      revenueCircleVillage: `Lutumari (${cluster.name})`,
      docVerifiedCode: '1',
      docVerifiedLabel: 'Aadhaar Card',
      docVerifiedOther: '',
      idLast4: t.last4,
      headName: t.headName,
      headAge: t.age,
      headStatusCode: idx % 5 === 0 ? '2' : '1',
      headStatusOther: '',
      religionCode:
        t.caste.includes('Karbi') || t.caste.includes('Tiwa') || t.caste.includes('Boro')
          ? '4'
          : t.caste.includes('Das')
            ? '2'
            : '1',
      religionOther: '',
      casteName: t.caste,
      casteCategoryCode: t.caste.includes('Karbi') || t.caste.includes('Tiwa') ? '4' : '1',
      primaryLanguageCode: t.caste.includes('Karbi') || t.caste.includes('Tiwa') ? '3' : '1',
      primaryLanguageOther: '',
      totalMembers: t.familySize,
      maleCount: Math.ceil(t.familySize / 2),
      femaleCount: Math.floor(t.familySize / 2),
      otherGenderCount: 0,
      ageUnder1: 0,
      age1to5: children0to5,
      age0to5: children0to5,
      age6to14: children6to14,
      age15to17: 0,
      age18to59: adults,
      age60Plus: elderly,
      vulnerableCodes: children0to5 > 0 ? ['2'] : elderly > 0 ? ['3'] : ['0'],
      incomeBeforeCode: t.incomeBefore,
      incomeBeforeApprox: t.incomeBeforeExact,
      incomeNowCode: t.incomeNow,
      landOwnedCode: idx % 3 === 0 ? '2' : '1',
      landBighas: idx % 3 === 0 ? undefined : 1.5,
      landSizeCode: idx % 3 === 0 ? '' : '2',
      landDocTypeCode: idx % 3 === 0 ? '' : '1',
      landDocOther: '',
      kitTarpaulin: true,
      kitFood: idx % 4 !== 0,
      docPhotoConsent: true,
    },
    answers: buildAnswersForHousehold(t, idx),
    reviews:
      t.status === 'APPROVED'
        ? [
            {
              id: `rev-${t.codeNum}-1`,
              decision: 'APPROVE',
              reviewerName: 'Dr. Samta Pandya',
              reviewerRole: 'SUPERVISOR',
              reason: 'All MPI & HHS responses verified against household roster.',
              createdAt: `${t.date}T16:30:00Z`,
            },
          ]
        : [],
    createdAt: `${t.date}T09:15:00Z`,
    updatedAt: `${t.date}T14:20:00Z`,
    submittedAt: t.status !== 'DRAFT' ? `${t.date}T13:50:00Z` : undefined,
  };
}

export function createInitialSurveys(): SurveyRecord[] {
  const templates: SeedTemplate[] = [...FEATURED_SEED];

  // Featured already includes 3 APPROVED (1 chankhula, 1 majgaon, 1 nim-bagan)
  // Need 37 more APPROVED to reach exact cluster targets:
  // Kandapara: 12, Chankhula: 8 (7 more), Majgaon: 7 (6 more), Kadomoni: 5, Juripar: 3, Bedari Par: 3, Nim Bagan: 2 (1 more)
  const approvedClusterDistribution = [
    ...Array(12).fill('kandapara'),
    ...Array(7).fill('chankhula'),
    ...Array(6).fill('majgaon'),
    ...Array(5).fill('kadomoni'),
    ...Array(3).fill('juripar'),
    ...Array(3).fill('bedari-par'),
    ...Array(1).fill('nim-bagan'),
  ]; // 37 approved + 3 featured = 40 APPROVED total

  // Featured includes 4 SUBMITTED; need 8 more SUBMITTED = 12 SUBMITTED total
  const submittedClusterDistribution = [
    'kandapara',
    'kandapara',
    'chankhula',
    'majgaon',
    'kadomoni',
    'juripar',
    'bedari-par',
    'nim-bagan',
  ];

  const volIds = ['u-vol-1', 'u-vol-2', 'u-vol-3', 'u-vol-4', 'u-vol-5', 'u-vol-6', 'u-vol-7'];
  const dates = [
    '2026-11-01',
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
    '2026-11-07',
    '2026-11-08',
    '2026-11-09',
  ];

  const totalExtra = approvedClusterDistribution.length + submittedClusterDistribution.length; // 45
  for (let i = 0; i < totalExtra; i++) {
    const codeNum = 1235 - i;
    const isApproved = i < approvedClusterDistribution.length;
    const status: SurveyStatus = isApproved ? 'APPROVED' : 'SUBMITTED';
    const clusterId = isApproved
      ? approvedClusterDistribution[i]
      : submittedClusterDistribution[i - approvedClusterDistribution.length];
    const incomeBeforeNum = [8000, 10000, 12000, 15000][i % 4];
    templates.push({
      codeNum,
      headName: EXTRA_NAMES[i % EXTRA_NAMES.length],
      clusterId,
      status,
      volunteerId: volIds[i % volIds.length],
      familySize: 3 + (i % 6),
      incomeBefore: String(2 + (i % 3)),
      incomeBeforeExact: String(incomeBeforeNum),
      incomeNow: String(1 + (i % 3)),
      date: dates[i % dates.length],
      last4: String(1000 + ((i * 379) % 8999)),
      caste: i % 6 === 0 ? 'Karbi' : i % 5 === 0 ? 'Deshi' : 'Bengali Muslim / Miya',
      age: 28 + (i % 36),
      hungerLevel: i % 3 === 0 ? '2' : i % 2 === 0 ? '1' : '0',
    });
  }

  return templates.map((t, idx) => buildSurveyFromTemplate(t, idx));
}

export function createInitialDocuments(surveys: SurveyRecord[]): HouseholdDocument[] {
  const docs: HouseholdDocument[] = [];
  const categories = [
    { id: 'aadhaar', label: 'Aadhaar Card' },
    { id: 'ration_card', label: 'Ration Card' },
    { id: 'eviction_notice', label: 'Eviction Notice / Court Proof' },
    { id: 'family_photo', label: 'Family Photo' },
    { id: 'voter_id', label: 'Voter ID' },
    { id: 'nrc_legacy', label: 'NRC / ARN / Legacy Record' },
  ];

  // Top 4 showcase documents match Recent Documents widget
  const topShowcase: {
    surveyIdx: number;
    catIdx: number;
    status: 'VERIFIED' | 'PENDING' | 'REJECTED';
    reason?: string;
  }[] = [
    { surveyIdx: 0, catIdx: 0, status: 'VERIFIED' },
    { surveyIdx: 1, catIdx: 1, status: 'VERIFIED' },
    { surveyIdx: 2, catIdx: 2, status: 'VERIFIED' },
    { surveyIdx: 3, catIdx: 3, status: 'VERIFIED' },
  ];

  topShowcase.forEach((item, idx) => {
    const s = surveys[item.surveyIdx];
    const cat = categories[item.catIdx];
    const docId = `doc-top-${idx + 1}`;
    docs.push({
      id: docId,
      householdId: s.householdId,
      surveyCode: s.surveyCode,
      headName: s.profile.headName,
      clusterName: s.clusterName,
      categoryId: cat.id,
      docType: cat.label,
      aadhaarLast4: cat.id === 'aadhaar' ? s.profile.idLast4 : undefined,
      consentConfirmed: true,
      uploadStatus: 'UPLOADED',
      uploadProgress: 100,
      verificationStatus: item.status,
      rejectionReason: item.reason,
      uploadedById: s.volunteerId,
      uploadedByName: s.volunteerName,
      uploadedAt: `${s.profile.surveyDate}T11:${10 + idx}:00Z`,
      verifiedByName: item.status === 'VERIFIED' ? 'Aasif Mujtaba' : undefined,
      verifiedAt: item.status === 'VERIFIED' ? `${s.profile.surveyDate}T16:00:00Z` : undefined,
      pages: [
        {
          id: `${docId}-p1`,
          pageNo: 1,
          fileName: `${s.surveyCode}_${cat.id}_p1.jpg`,
          mime: 'image/jpeg',
          sizeBytes: 342100 + idx * 14500,
          localPreviewUrl: generateDocumentMockPreview(
            cat.id,
            cat.label,
            s.profile.headName,
            s.surveyCode,
            s.profile.idLast4,
            1
          ),
          objectKey: `vault/${s.householdId}/${docId}/p1`,
        },
        ...(cat.id === 'eviction_notice'
          ? [
              {
                id: `${docId}-p2`,
                pageNo: 2,
                fileName: `${s.surveyCode}_${cat.id}_p2.jpg`,
                mime: 'image/jpeg' as const,
                sizeBytes: 289400,
                localPreviewUrl: generateDocumentMockPreview(
                  cat.id,
                  cat.label,
                  s.profile.headName,
                  s.surveyCode,
                  s.profile.idLast4,
                  2
                ),
                objectKey: `vault/${s.householdId}/${docId}/p2`,
              },
            ]
          : []),
      ],
    });
  });

  // Add 120 more documents across surveys for 124 total documents (matching sidebar badge)
  // Ensure top 4 surveys have +3, +2, +4, +3 doc counts!
  const extraPerSurvey = [
    { surveyIdx: 0, catIdx: 1 },
    { surveyIdx: 0, catIdx: 3 },
    { surveyIdx: 1, catIdx: 0 },
    { surveyIdx: 2, catIdx: 0 },
    { surveyIdx: 2, catIdx: 1 },
    { surveyIdx: 2, catIdx: 3 },
    { surveyIdx: 3, catIdx: 0 },
    { surveyIdx: 3, catIdx: 1 },
  ];

  extraPerSurvey.forEach((item, idx) => {
    const s = surveys[item.surveyIdx];
    const cat = categories[item.catIdx];
    const docId = `doc-feat-${idx + 1}`;
    docs.push({
      id: docId,
      householdId: s.householdId,
      surveyCode: s.surveyCode,
      headName: s.profile.headName,
      clusterName: s.clusterName,
      categoryId: cat.id,
      docType: cat.label,
      aadhaarLast4: cat.id === 'aadhaar' ? s.profile.idLast4 : undefined,
      consentConfirmed: true,
      uploadStatus: 'UPLOADED',
      uploadProgress: 100,
      verificationStatus: idx % 3 === 0 ? 'PENDING' : 'VERIFIED',
      uploadedById: s.volunteerId,
      uploadedByName: s.volunteerName,
      uploadedAt: `${s.profile.surveyDate}T12:15:00Z`,
      verifiedByName: idx % 3 === 0 ? undefined : 'Dr. Samta Pandya',
      pages: [
        {
          id: `${docId}-p1`,
          pageNo: 1,
          fileName: `${s.surveyCode}_${cat.id}.jpg`,
          mime: 'image/jpeg',
          sizeBytes: 280400 + idx * 4200,
          localPreviewUrl: generateDocumentMockPreview(
            cat.id,
            cat.label,
            s.profile.headName,
            s.surveyCode,
            s.profile.idLast4,
            1
          ),
          objectKey: `vault/${s.householdId}/${docId}/p1`,
        },
      ],
    });
  });

  // Remaining 112 documents distributed across surveys 4..54 -> total = 4 + 8 + 112 = 124
  for (let i = 0; i < 112; i++) {
    const s = surveys[4 + (i % (surveys.length - 4))];
    if (!s) continue;
    const cat = categories[i % categories.length];
    const docId = `doc-${i + 20}`;
    const vStatus = i % 6 === 0 ? 'PENDING' : i % 19 === 0 ? 'REJECTED' : 'VERIFIED';
    docs.push({
      id: docId,
      householdId: s.householdId,
      surveyCode: s.surveyCode,
      headName: s.profile.headName,
      clusterName: s.clusterName,
      categoryId: cat.id,
      docType: cat.label,
      aadhaarLast4: cat.id === 'aadhaar' ? s.profile.idLast4 : undefined,
      consentConfirmed: true,
      uploadStatus: i === 5 ? 'LOCAL_ONLY' : 'UPLOADED',
      uploadProgress: i === 5 ? 0 : 100,
      verificationStatus: vStatus,
      rejectionReason:
        vStatus === 'REJECTED' ? 'Text illegible due to glare; resubmit required.' : undefined,
      uploadedById: s.volunteerId,
      uploadedByName: s.volunteerName,
      uploadedAt: `${s.profile.surveyDate}T12:20:00Z`,
      verifiedByName: vStatus === 'VERIFIED' ? 'Dr. Samta Pandya' : undefined,
      verifiedAt: vStatus === 'VERIFIED' ? `${s.profile.surveyDate}T17:00:00Z` : undefined,
      pages: [
        {
          id: `${docId}-p1`,
          pageNo: 1,
          fileName: `${s.surveyCode}_${cat.id}.jpg`,
          mime: 'image/jpeg',
          sizeBytes: 295000 + i * 1200,
          localPreviewUrl: generateDocumentMockPreview(
            cat.id,
            cat.label,
            s.profile.headName,
            s.surveyCode,
            s.profile.idLast4,
            1
          ),
          objectKey: `vault/${s.householdId}/${docId}/p1`,
        },
      ],
    });
  }

  return docs;
}

export const INITIAL_AUDIT_LOGS: AuditEvent[] = [
  {
    id: 'aud-1',
    actorName: 'Talha',
    actorRole: 'VOLUNTEER',
    action: 'survey_submit',
    entity: 'survey',
    entityId: 'M2S-001245',
    summary: 'Survey M2S-001245 submitted by Talha',
    createdAt: '2 minutes ago',
  },
  {
    id: 'aud-2',
    actorName: 'Dr. Samta Pandya',
    actorRole: 'SUPERVISOR',
    action: 'review_pending',
    entity: 'survey',
    entityId: 'M2S-001244',
    summary: 'M2S-001244 pending review',
    createdAt: '15 minutes ago',
  },
  {
    id: 'aud-3',
    actorName: 'Jagrit Yadav',
    actorRole: 'VOLUNTEER',
    action: 'document_upload',
    entity: 'document',
    entityId: 'M2S-001243',
    summary: '3 documents uploaded (M2S-001243)',
    createdAt: '28 minutes ago',
  },
  {
    id: 'aud-4',
    actorName: 'Aasif Mujtaba',
    actorRole: 'ADMIN',
    action: 'review_return',
    entity: 'survey',
    entityId: 'M2S-001240',
    summary: 'Returned M2S-001240 (Momena Bibi) for Touzi page 2 re-capture',
    createdAt: '2026-11-11T11:50:00Z',
  },
  {
    id: 'aud-5',
    actorName: 'Aasif Mujtaba',
    actorRole: 'ADMIN',
    action: 'login',
    entity: 'user',
    entityId: 'u-admin-1',
    summary: 'Signed in to Admin Console',
    createdAt: '2026-11-11T09:05:00Z',
  },
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'not-1',
    title: 'Survey M2S-001245 submitted by Talha',
    detail: 'Aftab Khan (Kandapara) is ready for supervisor review.',
    time: '2 minutes ago',
    unread: true,
    linkTo: '/admin/reviews',
  },
  {
    id: 'not-2',
    title: 'Documents pending verification',
    detail: 'Multiple newly uploaded household identity records await verification.',
    time: '15 minutes ago',
    unread: true,
    linkTo: '/admin/documents',
  },
  {
    id: 'not-3',
    title: 'Offline queue synced from Chankhula',
    detail: 'Sara Khan synced 2 completed household surveys.',
    time: '28 minutes ago',
    unread: false,
    linkTo: '/admin/surveys',
  },
];

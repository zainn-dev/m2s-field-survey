export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'VOLUNTEER';

export type SurveyStatus =
  | 'DRAFT'
  | 'PENDING_SYNC'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'RETURNED'
  | 'REJECTED';

export type ReviewDecision = 'APPROVE' | 'RETURN' | 'REJECT';

export type DocUploadStatus =
  | 'LOCAL_ONLY'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'UPLOAD_FAILED';

export type DocVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type Language = 'en' | 'hi';

export interface QuestionOption {
  /** Unique key within the question so distinct options sharing numeric code [0] stay independent in UI */
  key: string;
  /** Numeric code stored for backend compatibility (e.g. "0", "1", "2") */
  code: string;
  en: string;
  hi: string;
  /** Optional tag like Non-Deprived / Deprived / Score 0 */
  tag?: string;
  /** Shows a blank text input right below when tapped/selected (e.g., Other / Specify Details). */
  specifyText?: boolean;
  /** Optional prompt displayed above/inside the blank text input when selected. */
  specifyPromptEn?: string;
  specifyPromptHi?: string;
  /** Exclusive selection within a multi-select question (e.g., "None of the above"). */
  exclusive?: boolean;
}

export interface QuestionDef {
  id: string;
  section: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  sectionTitleEn: string;
  sectionTitleHi: string;
  type: 'single' | 'multi' | 'text' | 'date' | 'q40';
  en: string;
  hi: string;
  source: string;
  indicator: string;
  options?: QuestionOption[];
  placeholderEn?: string;
  placeholderHi?: string;
  /** Optional helper hint explaining skip/conditional logic */
  conditionalHintEn?: string;
  conditionalHintHi?: string;
  /** Always show an inline text detail field below options / date picker (e.g., Q1a year/origin, Q3a sites, Q3b month/year). */
  alwaysShowDetailInput?: boolean;
  detailPromptEn?: string;
  detailPromptHi?: string;
  /** Optional photo capture callout (e.g., Q1b, Q3c). */
  photoHintEn?: string;
  photoHintHi?: string;
}

export interface HouseholdProfile {
  /** Internal / tracking metadata */
  surveyCode: string;
  surveyDate: string;
  interviewer: string;
  translator: string;
  /** Cluster assignment FK + B1 District, Revenue Circle & Village */
  clusterId: string;
  clusterName: string;
  clusterOther: string;
  districtCode?: string;
  districtOther?: string;
  revenueCircleVillage?: string;
  /** Consent for Document Photo (Screen 1 check #2) */
  docPhotoConsent?: boolean;
  /** B2: Identity Document Verified */
  docVerifiedCode: string;
  docVerifiedLabel: string;
  docVerifiedOther?: string;
  idLast4: string;
  /** B3: Head of Household */
  headName: string;
  headAge: number | '';
  headStatusCode: string;
  headStatusOther?: string;
  /** B4: Family Members & Age-Sex Breakdown */
  totalMembers: number;
  maleCount: number;
  femaleCount: number;
  otherGenderCount: number;
  ageUnder1?: number;
  age1to5?: number;
  age0to5: number;
  age6to14: number;
  age15to17: number;
  age18to59: number;
  age60Plus: number;
  /** B5: Vulnerable Members */
  vulnerableCodes: string[];
  vulnerableOther?: string;
  /** B6: Religion */
  religionCode: string;
  religionOther?: string;
  /** B7: Caste / Community / Tribe & Category */
  casteName: string;
  casteCategoryCode: string;
  casteCategoryOther?: string;
  /** B8: Primary Language */
  primaryLanguageCode: string;
  primaryLanguageCodes?: string[];
  primaryLanguageOther?: string;
  /** B9: Total Household Income & Relief Kit */
  incomeBeforeCode: string;
  incomeBeforeApprox: string;
  incomeNowCode: string;
  kitTarpaulin: boolean;
  kitFood: boolean;
  /** B10: Land Ownership, Size (Bighas) & Tenure Document */
  landOwnedCode?: string;
  landBighas?: string;
  landSizeCode?: string;
  landDocTypeCode?: string;
  landDocOther?: string;
}

export interface QuestionAnswer {
  questionId: string;
  /** Selected option keys (UI-safe unique keys) */
  optionKeys: string[];
  /** Authoritative numeric codes for API sync */
  optionCodes: string[];
  otherText?: string;
}

export interface ReviewEntry {
  id: string;
  decision: ReviewDecision;
  reviewerName: string;
  reviewerRole: Role;
  reason: string;
  createdAt: string;
}

export type GpsPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface SurveyRecord {
  id: string;
  householdId: string;
  surveyCode: string;
  clusterId: string;
  clusterName: string;
  volunteerId: string;
  volunteerName: string;
  status: SurveyStatus;
  revision: number;
  consentGiven: boolean;
  gpsConsent?: boolean;
  gpsLat?: number;
  gpsLng?: number;
  gpsAccuracyMeters?: number;
  gpsCapturedAt?: string;
  gpsPermissionStatus?: GpsPermissionStatus;
  submittedIp?: string;
  submittedIpLocation?: string;
  startedAt?: string;
  durationSec?: number;
  profile: HouseholdProfile;
  answers: Record<string, QuestionAnswer>;
  reviews: ReviewEntry[];
  qualityResolutions?: QualityResolutionRecord[];
  qualityHistory?: ValidationHistoryEntry[];
  qualityOverrides?: QualityOverrideRecord[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export type QualitySeverity = 'error' | 'warning' | 'advisory' | 'info';

export type QualityCategory =
  | 'missing_required'
  | 'invalid_value'
  | 'demographic_sum'
  | 'contradiction'
  | 'duplicate_household'
  | 'missing_document'
  | 'duration'
  | 'supervisor_advisory'
  | 'semantic_coding'
  | 'informational';

export type ResolutionStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'CORRECTED'
  | 'ACKNOWLEDGED'
  | 'SUPERVISOR_REVIEW_REQUIRED'
  | 'WAIVED_WITH_REASON';

export interface QualityPolicyConfig {
  blockOnErrors: boolean;
  requireWarningAcknowledgement: boolean;
  allowSupervisorOverride: boolean;
  escalateVerifiedExceptionsToSupervisor: boolean;
  minDurationSec: number;
}

export interface NormalizedOptionValue {
  question_id: string;
  option_key: string;
  numeric_code: string;
  display_label: string;
  display_label_hi?: string;
  semantic_category: string;
  is_na: boolean;
  is_unknown: boolean;
}

export type AnswerStateKind = 'missing' | 'answered' | 'na' | 'unknown' | 'ambiguous_legacy';

export interface NormalizedSurveyAnswer {
  question_id: string;
  state: AnswerStateKind;
  options: NormalizedOptionValue[];
  option_key: string | null;
  option_keys: string[];
  numeric_code: string | null;
  option_codes: string[];
  display_label: string;
  semantic_category: string;
  semantic_categories: string[];
  other_text: string;
  is_missing: boolean;
  is_na: boolean;
  is_unknown: boolean;
  is_ambiguous_legacy: boolean;
}

export interface QualityResolutionRecord {
  id: string;
  surveyId: string;
  ruleId: string;
  ruleVersion: string;
  status: ResolutionStatus;
  note?: string;
  verifiedById?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  answerSnapshot?: Record<string, { optionKeys: string[]; optionCodes: string[]; otherText?: string }>;
  supervisorStatus?: 'PENDING' | 'APPROVED' | 'WAIVED' | 'REJECTED';
  supervisorNote?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  clientEventId?: string;
  updatedAt: string;
}

export interface ValidationHistoryEntry {
  id: string;
  surveyId: string;
  ruleId: string;
  ruleTitle: string;
  severity: QualitySeverity;
  eventType:
    | 'TRIGGERED'
    | 'OPENED'
    | 'VERIFIED'
    | 'CORRECTED'
    | 'ACKNOWLEDGED'
    | 'SUPERVISOR_QUEUED'
    | 'SUPERVISOR_APPROVED'
    | 'SUPERVISOR_WAIVED'
    | 'OVERRIDE_APPLIED'
    | 'REOPENED';
  status: ResolutionStatus;
  timestamp: string;
  actorId?: string;
  actorName?: string;
  actorRole?: Role;
  note?: string;
  previousAnswers?: Record<string, unknown>;
  updatedAnswers?: Record<string, unknown>;
  supervisorStatus?: string;
  clientEventId?: string;
}

export interface QualityOverrideRecord {
  id: string;
  surveyId: string;
  ruleIds: string[];
  reason: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  createdAt: string;
  active: boolean;
}

export interface QualityIssue {
  id: string;
  code: string;
  ruleId?: string;
  ruleVersion?: string;
  severity: QualitySeverity;
  category: QualityCategory;
  questionId?: string;
  relevantQuestionIds?: string[];
  dependencies?: string[];
  sectionKey?: string;
  title: string;
  detail: string;
  explanation?: string;
  suggestedCorrection?: string;
  answeredSummary?: string;
  dataInterpretation?: string;
  suggestedSupervisorAction?: string;
  requiresAcknowledgement?: boolean;
  supervisorReviewRecommended?: boolean;
  supportsVerifiedException?: boolean;
  blocksSubmission?: boolean;
  resolutionStatus?: ResolutionStatus;
  resolutionNote?: string;
  resolvedAt?: string;
  resolvedByName?: string;
  supervisorReviewStatus?: 'PENDING' | 'APPROVED' | 'WAIVED' | 'REJECTED';
  overrideReason?: string;
}

export interface SurveyQualityReport {
  completenessScore: number;
  answeredRequired: number;
  totalRequired: number;
  totalQuestions?: number;
  answeredQuestions?: number;
  missingQuestionIds?: string[];
  documentCompletion?: {
    uploadedCount: number;
    verifiedCount: number;
    pendingCount: number;
    rejectedCount: number;
    missingRequiredCategories: string[];
  };
  lastSavedAt?: string;
  profileCompletenessPct: number;
  questionsCompletenessPct: number;
  hasBlockingErrors: boolean;
  errors: QualityIssue[];
  warnings: QualityIssue[];
  advisories: QualityIssue[];
  infos: QualityIssue[];
  issues: QualityIssue[];
  unresolvedErrors?: QualityIssue[];
  unresolvedWarnings?: QualityIssue[];
  needsSupervisorReview?: boolean;
  canSubmit?: boolean;
  submissionBlockReasons?: string[];
  normalizedAnswers?: Record<string, NormalizedSurveyAnswer>;
  resolutions?: Record<string, QualityResolutionRecord>;
  history?: ValidationHistoryEntry[];
  overrides?: QualityOverrideRecord[];
  ruleCountEvaluated?: number;
  affectedRuleIds?: string[];
}

export interface DocumentPageItem {
  id: string;
  pageNo: number;
  fileName: string;
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  /** Safe in-memory object URL or generated SVG data URL (never a public storage URL) */
  localPreviewUrl: string;
  objectKey?: string;
}

export interface DocumentCategoryConfig {
  id: string;
  label: string;
  labelHi: string;
  requiredForSubmission?: boolean;
  requiresLast4?: boolean;
  enabled: boolean;
}

export interface HouseholdDocument {
  id: string;
  householdId: string;
  surveyCode: string;
  headName: string;
  clusterName: string;
  categoryId: string;
  docType: string;
  aadhaarLast4?: string;
  consentConfirmed: boolean;
  uploadStatus: DocUploadStatus;
  uploadProgress: number;
  verificationStatus: DocVerificationStatus;
  rejectionReason?: string;
  uploadedById: string;
  uploadedByName: string;
  uploadedAt: string;
  verifiedByName?: string;
  verifiedAt?: string;
  pages: DocumentPageItem[];
}

export interface ClusterItem {
  id: string;
  code: string;
  name: string;
  targetHouseholds: number;
  mapX: number;
  mapY: number;
  active: boolean;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: Role;
  assignedClusterIds: string[];
  active: boolean;
  lastActive: string;
  targetHouseholds?: number;
  lastIp?: string;
  lastIpLocation?: string;
  lastGpsLat?: number;
  lastGpsLng?: number;
  lastGpsAccuracy?: number;
  lastGpsCapturedAt?: string;
  lastLocationLabel?: string;
}

export interface AuditEvent {
  id: string;
  actorName: string;
  actorRole: Role;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  createdAt: string;
  /** Only returned to admins */
  ip?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  linkTo: string;
}


export interface StudySettings {
  targetSample: number;
  allowVolunteerDelete: boolean;
  requireDocumentsForSubmission: boolean;
  qualityPolicy?: QualityPolicyConfig;
}

/** GET /api/v1/bootstrap — everything the signed-in user may see. */
export interface BootstrapPayload {
  user: UserAccount;
  users: UserAccount[];
  clusters: ClusterItem[];
  surveys: SurveyRecord[];
  documents: HouseholdDocument[];
  docCategories: DocumentCategoryConfig[];
  study: StudySettings;
  qualityPolicy?: QualityPolicyConfig;
  qualityRules?: Array<{
    id: string;
    version: string;
    title: string;
    code: string;
    severity: QualitySeverity;
    category: QualityCategory;
    dependencies: string[];
    relevantQuestionIds: string[];
    requiresAcknowledgement: boolean;
    supervisorReviewRecommended: boolean;
    supportsVerifiedException: boolean;
    blocksSubmission: boolean;
    description: string;
  }>;
  auditLogs: AuditEvent[];
  notifications: NotificationItem[];
  serverTime: string;
}

export interface NewUserInput {
  name: string;
  email: string;
  mobile: string;
  role: Role;
  assignedClusterIds: string[];
  targetHouseholds?: number;
  password: string;
}

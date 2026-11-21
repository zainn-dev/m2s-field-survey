-- CreateTable
CREATE TABLE "SurveyQualityResolution" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "verifiedById" TEXT,
    "verifiedByName" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "answerSnapshot" JSONB,
    "supervisorStatus" TEXT,
    "supervisorNote" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "clientEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyQualityResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQualityEvent" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleTitle" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "note" TEXT,
    "previousAnswers" JSONB,
    "updatedAnswers" JSONB,
    "supervisorStatus" TEXT,
    "clientEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyQualityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurveyQualityResolution_status_idx" ON "SurveyQualityResolution"("status");

-- CreateIndex
CREATE INDEX "SurveyQualityResolution_supervisorStatus_idx" ON "SurveyQualityResolution"("supervisorStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyQualityResolution_surveyId_ruleId_key" ON "SurveyQualityResolution"("surveyId", "ruleId");

-- CreateIndex
CREATE INDEX "SurveyQualityEvent_surveyId_createdAt_idx" ON "SurveyQualityEvent"("surveyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyQualityEvent_surveyId_clientEventId_key" ON "SurveyQualityEvent"("surveyId", "clientEventId");

-- AddForeignKey
ALTER TABLE "SurveyQualityResolution" ADD CONSTRAINT "SurveyQualityResolution_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQualityEvent" ADD CONSTRAINT "SurveyQualityEvent_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;


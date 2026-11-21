-- One-time reset for fresh Assam Socio-Economic Baseline Survey (Q1a–Q28, B1–B10).
-- Removes prior test/sample survey records, documents, quality logs, and old questionnaire definitions
-- while preserving User login accounts, Cluster definitions, and ClusterAssignments.

DELETE FROM "SurveyQualityEvent";
DELETE FROM "SurveyQualityResolution";
DELETE FROM "ReviewAction";
DELETE FROM "Answer";
DELETE FROM "DocumentPage";
DELETE FROM "Document";
DELETE FROM "Survey";
DELETE FROM "Household";
DELETE FROM "SyncRecord";
DELETE FROM "AuditLog" WHERE "entity" IN ('survey', 'document', 'export', 'household');
DELETE FROM "QuestionnaireVersion";
DELETE FROM "Setting" WHERE "key" = 'docCategories';


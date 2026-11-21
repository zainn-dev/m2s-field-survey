# API Reference — M2S Field Survey (`/api/v1`)

Interactive OpenAPI / Swagger UI is served at `/docs` when `NODE_ENV !== 'production'`. All endpoints below are prefixed with `/api/v1` unless noted.

## 1. Authentication & Sessions

| Method & Path | Access | Notes |
| --- | --- | --- |
| `GET /health` | Public | Liveness & DB check (`ok`, `storage`, `scanner`, `uptimeSec`, `time`) |
| `POST /auth/login` | Public (throttled) | Body `{ identifier, password, app?: 'admin' \| 'volunteer' }`. Sets `m2s_session` `HttpOnly` `SameSite=Strict` cookie. When `X-Client-Platform: capacitor` header and `app: 'volunteer'` are sent by the Volunteer Mobile App, also returns `{ ...UserAccount, token }` for `Authorization: Bearer <token>`. |
| `POST /auth/logout` | Authenticated | Clears `m2s_session` cookie |
| `GET /auth/me` | Authenticated | Returns current scoped `UserAccount` |
| `POST /auth/change-password` | Authenticated | Updates password (`10+` chars, bcrypt) and increments `tokenVersion` |

## 2. Bootstrap & Reference Data

| Method & Path | Access | Notes |
| --- | --- | --- |
| `GET /bootstrap` | Authenticated | Returns role-scoped `user`, `users`, `clusters`, `surveys`, `documents`, `docCategories`, `study`, `auditLogs`, `notifications`, `serverTime`. |
| `GET /clusters` | Authenticated | Lists active & inactive clusters |
| `POST /clusters` | `ADMIN` / `SUPER_ADMIN` | Creates cluster (`code`, `name`, `targetHouseholds`, `mapX`, `mapY`) |
| `PATCH /clusters/:id` | `ADMIN` / `SUPER_ADMIN` | Updates cluster target/coordinates/active state |
| `GET /settings` | Authenticated | Returns `docCategories` and `study` settings |
| `PUT /settings/doc-categories` | `ADMIN` / `SUPER_ADMIN` | Updates document categories |
| `PUT /settings/study` | `ADMIN` / `SUPER_ADMIN` | Updates `targetSample`, `allowVolunteerDelete`, `requireDocumentsForSubmission` |

## 3. Surveys & Review Workflow

| Method & Path | Access | Notes |
| --- | --- | --- |
| `GET /surveys` | Scoped | `VOLUNTEER`: own households; `SUPERVISOR`: assigned clusters; `ADMIN`/`SUPER_ADMIN`: all |
| `GET /surveys/:id` | Scoped | Full household survey (`B1`–`B10`, `Q1a`–`Q28`, `reviews`, consented GPS metadata, `startedAt`, `durationSec`) |
| `PUT /surveys/:id` | Owner (`DRAFT`/`RETURNED`/`PENDING_SYNC`) or Admin | Upserts household survey. Requires `baseRevision` (`409 REVISION_CONFLICT` on stale edit) and `idempotencyKey`. Coordinates (`gpsLat`, `gpsLng`, `gpsAccuracyMeters`, `gpsCapturedAt`) are persisted only when `gpsConsent: true` and cleared when `gpsConsent: false`. |
| `POST /surveys/:id/submit` | Owner / Admin | Transitions to `SUBMITTED`. Validates `consentGiven`, required answers, server-derived `optionCodes`, and `requireDocumentsForSubmission` (`422 DOCUMENTS_REQUIRED`). |
| `POST /surveys/:id/review` | `SUPERVISOR` / `ADMIN` / `SUPER_ADMIN` | Decision `APPROVE`, `RETURN`, or `REJECT` (reason required for `RETURN`/`REJECT`). |
| `DELETE /surveys/:id` | Draft Owner (when enabled) / Admin | Deletes unapproved draft |

## 4. Private Document Storage & Verification

| Method & Path | Access | Notes |
| --- | --- | --- |
| `POST /households/:householdId/documents` | Household Scope | Multipart upload (`files[]`, up to 10 pages, max 10 MB/page). Validates actual magic bytes (`JPEG`, `PNG`, `PDF`), scans for EICAR/PDF active actions & ClamAV (`CLAMAV_HOST`), and stores under UUID object keys. Rejects full Aadhaar strings; `aadhaarLast4` accepts only 4 digits. |
| `GET /documents/:id/pages/:pageId/content` | Document Scope | Streams private bytes with `X-Content-Type-Options: nosniff` and restrictive CSP (`?download=1` for attachment disposition). |
| `POST /documents/:id/verify` | `SUPERVISOR` / `ADMIN` / `SUPER_ADMIN` | Marks `VERIFIED` or `REJECTED` (reason required on reject). |
| `DELETE /documents/:id` | Owner (`DRAFT`/`RETURNED`) / Admin | Removes document and underlying object |

## 5. Exports, Users & Audit

| Method & Path | Access | Notes |
| --- | --- | --- |
| `GET /exports/surveys.csv` | `SUPERVISOR` / `ADMIN` / `SUPER_ADMIN` | Formula-injection-safe UTF-8 BOM CSV with `status`, `clusterId`, `from`, `to` filters and consented GPS columns (`gpsConsent`, `gpsLat`, `gpsLng`, `gpsAccuracyMeters`, `gpsCapturedAt`, `durationSec`). |
| `GET /exports/answers.csv` | `SUPERVISOR` / `ADMIN` / `SUPER_ADMIN` | Long-format questionnaire analytical CSV |
| `GET /exports/documents.zip` | `SUPERVISOR` / `ADMIN` / `SUPER_ADMIN` | Streaming ZIP of clean scoped household documents with `manifest.csv` and SHA-256 checksums |
| `GET /users` / `POST /users` / `PATCH /users/:id` | Scoped / `ADMIN`+ | Team management, deactivation & password reset (increments `tokenVersion`) |
| `GET /audit` / `POST /audit` / `GET /notifications` / `POST /notifications/read` | Authenticated | Scoped append-only audit log (IP addresses visible only to `ADMIN` / `SUPER_ADMIN`) |


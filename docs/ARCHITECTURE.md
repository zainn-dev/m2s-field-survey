# Architecture Overview — M2S Field Survey

## 1. Monorepo Layout

- [`apps/api`](../apps/api) — NestJS 10 REST API (`PORT=3000`, global prefix `/api`, URI versioning `v1`), Prisma ORM, Express runtime serving static Admin Web assets in production.
- [`apps/web`](../apps/web) — React 18 + Vite + Tailwind CSS browser Admin & Supervisor Web Console backed by Dexie/IndexedDB.
- [`apps/mobile`](../apps/mobile) — React 18 + TypeScript + Capacitor 6 native Android Volunteer Mobile App (`org.miles2smile.survey`) using `@capacitor/camera`, `@capacitor/geolocation`, `@capacitor/network`, `@capacitor/preferences`, `@capacitor/app`, and Dexie IndexedDB. Contains strictly Volunteer workflows only (no Admin routes or screens).
- [`packages/shared`](../packages/shared) — Shared `@m2s/shared` survey model, questionnaire data, quality checker, magic-byte file preparation, GPS capture, printable PDF Case File builder, and field UI components.
- [`questionnaire/questionnaire.v1.json`](../questionnaire/questionnaire.v1.json) — Authoritative bilingual study instrument (Part I `B1`–`B10`, Part II `Q1a`–`Q28`, sections `A`–`F`, option keys and analytical codes).
- [`deploy/`](../deploy) — Production Docker entrypoint script and Nginx reverse-proxy template.
- [`scripts/`](../scripts) — Development orchestrator ([`scripts/dev.mjs`](../scripts/dev.mjs)), deployment pre-flight check ([`scripts/deploy-check.mjs`](../scripts/deploy-check.mjs)), database backup/restore (`backup-db.mjs`, `restore-db.mjs`), Android APK builder (`build-android-apk.mjs`), and clean source packaging (`create-source-zip.mjs`).

## 2. Backend Security & Data Guarantees

- **Authentication (`AuthController`, `AuthGuard`)**: Credentials are verified with `bcryptjs`. Sessions are stored in `m2s_session` `HttpOnly`, `SameSite=Strict` cookies (`Secure` enabled in production, configurable via `COOKIE_SECURE`). `AuthGuard` re-checks `user.active` and `tokenVersion` against PostgreSQL on every authenticated request.
- **Record-Level Authorization (`common/scope.ts`)**:
  - `SUPER_ADMIN` & `ADMIN`: global visibility and administrative controls.
  - `SUPERVISOR`: strictly restricted to assigned clusters (`ClusterAssignment`).
  - `VOLUNTEER`: restricted to households created/assigned to their user ID, blocked from desktop admin routes and exports.
- **Survey Integrity (`SurveysController`, `common/validation.ts`)**:
  - Every `PUT /api/v1/surveys/:id` requires `idempotencyKey` and `baseRevision` (`409 REVISION_CONFLICT` on concurrent stale edits).
  - Answer `optionCodes` are always re-derived server-side from authoritative question definitions.
  - Study settings (`cluster.active`, `study.requireDocumentsForSubmission`, `study.allowVolunteerDelete`) are enforced server-side.
  - Full Aadhaar numbers are rejected; only the last 4 digits (`isLast4`) are persisted.
- **Document Storage & Scanning (`DocumentsController`, `StorageService`, `ScannerService`)**:
  - Magic-byte verification (`sniffMime`) accepts only JPEG, PNG, and PDF up to 10 MB per page / 10 pages per upload.
  - `ScannerService` inspects uploaded bytes for EICAR signatures and active PDF `/JavaScript` or `/Launch` actions, and streams via ClamAV TCP `zINSTREAM` when `CLAMAV_HOST` is configured.
  - Clean files are written under UUID object keys (`STORAGE_DIR` or S3) and streamed through `GET /api/v1/documents/:id/pages/:pageId/content` with `nosniff` and restrictive CSP headers.
- **Audit Trail (`AuditService`)**: Append-only database log recording logins/failures, survey lifecycle actions, quarantines, document views/downloads, and exports.

## 3. Exports & Reporting (`ExportsController`, `exportHelpers.ts`)

- Backend streaming endpoints (`GET /api/v1/exports/surveys.csv`, `answers.csv`, `documents.zip`) support `status`, `clusterId`, `from`, and `to` filters.
- Both server CSV writers and browser CSV helpers prefix cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` with `'` to prevent spreadsheet formula injection, and emit a UTF-8 BOM (`\uFEFF`) for Hindi/INR rendering.
- Browser `.xlsx` exports build multi-sheet Office Open XML ZIP workbooks client-side via `buildXlsxBlob`.

## 4. Offline-First Field PWA (`apps/web`)

- **IndexedDB Queue (`db.ts`, `appStore.tsx`)**: Field surveys and document page blobs (`LOCAL_ONLY`) queue safely offline with a two-phase flush (save draft -> upload queued attachments -> final submit) so `requireDocumentsForSubmission` passes reliably upon reconnection.
- **Service Worker (`public/sw.js`)**: Caches built static assets and `/index.html` while explicitly bypassing `/api/*` network requests so stale authenticated responses are never served from SW cache.


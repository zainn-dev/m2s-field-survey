# M2S Field Survey

The household survey and document-collection system for the Miles2Smile Foundation's Lutumari Reserve Forest eviction study. It separates the two field and coordinator experiences sharing one NestJS + PostgreSQL backend:

- **Volunteer Mobile App (`apps/mobile`)**: React + TypeScript + Capacitor 6 native Android app for field volunteers only (offline surveys B1–B10 & Q1a–Q28, camera/gallery/PDF capture, consent-based GPS, background/retry sync, My Surveys). Contains zero Admin screens or routes.
- **Admin Web Console (`apps/web`)**: Browser-based coordinator and researcher workspace (`/admin`) for cluster maps with consented GPS markers, quality flags, Case File PDF downloads, volunteer monitoring, advanced analytics, exports, and audit logs.

The monorepo also shares `@m2s/shared` (`packages/shared`) with `apps/api` (NestJS, Prisma, PostgreSQL, private local disk or S3-compatible document storage).

## Quick start (local, no Docker)

```bash
npm install
cp .env.example apps/api/.env      # then fill in DATABASE_URL password, JWT_SECRET, DEMO_PASSWORD
npm run dev                        # starts embedded PostgreSQL, the API and the web app
```

Leave `npm run dev` running. In a second terminal, run these once:

```bash
npm run setup                      # apply migrations, load questionnaire, clusters, document categories
npm run bootstrap-admin            # first SUPER_ADMIN (reads BOOTSTRAP_ADMIN_EMAIL / _PASSWORD, 14+ chars)
npm run seed:demo                  # optional: demo volunteers, surveys and documents (dev only)
```

Then open **http://localhost:5179**:

| URL | What |
| --- | --- |
| `/admin` | Admin console (SUPER_ADMIN, ADMIN, SUPERVISOR) |
| `/volunteer` | Field app (any role) |
| `http://localhost:3000/docs` | Swagger API docs (non-production only) |

Users sign in with their email or 10-digit mobile number. The demo accounts from `seed:demo` all use the `DEMO_PASSWORD` from `apps/api/.env`. To see their emails, open Users & Roles in the console.

If you would rather run Postgres and MinIO in Docker, use `docker compose up -d` and then `npm run dev:no-db`. Set `S3_*` in `.env` to use MinIO instead of local disk.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Starts the DB, the API (watch mode) and Vite together |
| `npm run setup` | Runs `prisma migrate deploy` and the base seed. Safe to re-run. |
| `npm run seed:demo` | Adds demo users and data. Refuses to run when `NODE_ENV=production` and skips if surveys already exist. |
| `npm run bootstrap-admin` | Creates the first super admin. There is no default password. |
| `npm run db:reset` | Wipes the DB and local storage, then reseeds (base and demo) |
| `npm run db:backup` / `npm run db:restore` | Creates/restores a transactional PostgreSQL JSON snapshot in `backups/` |
| `npm run package:source` | Generates a clean distributable ZIP in `dist-release/` without secrets, DB data, or builds |
| `npm run mobile:apk` | Builds the Capacitor Volunteer Android debug APK (`app-debug.apk`) |
| `npm run typecheck` / `npm test` / `npm run build` | CI checks across `@m2s/shared`, `apps/api`, `apps/web`, and `apps/mobile` |
| `npm -w apps/api run questionnaire:export` | Regenerates `questionnaire/questionnaire.v1.json` from the web questionnaire |

## Features

### Field app
- Sign in with email or mobile.
- Dashboard with personal targets, returned surveys to fix, and notifications.
- Survey wizard:
  - organised in sections: consent → household profile → question domains → documents → review;
  - autosave;
  - the survey code (`M2S-######`) is allocated by the server on first save;
  - multi-select questions (Q19, Q23, Q25a) accept several choices; Q26–Q28 are open text.
- Document capture:
  - camera or gallery, multi-page, JPG/PNG/PDF;
  - only the last 4 digits of Aadhaar are stored.
- Offline support:
  - saves and uploads are queued on the device (IndexedDB);
  - they retry automatically with backoff;
  - revision conflicts are resolved on the Sync screen.
- English and Hindi.

### Admin console
- Dashboard: KPIs, cluster progress, coverage map, trend, indicators.
- Survey register with filters, bulk approve and a detail drawer, which supports print and delete.
- Review queue with approve, return and reject, plus keyboard shortcuts.
- Document library:
  - preview, verify or reject, and download;
  - ZIP export with a manifest.
- Management: volunteers, users and roles, and clusters.
- Settings: study settings, document categories, and password.
- Analytics, including a question-level explorer.
- Exports: surveys CSV, answers CSV, documents ZIP, and summary CSVs.
- Audit log.

### Security
- **Sessions:** httpOnly SameSite=Strict JWT cookie. Sessions are revoked on password or role change (token version).
- **Rate limiting:** global, plus login throttling.
- **Request validation:** whitelisted DTOs.
- **Access control:**
  - role guard plus record-level scope: volunteers see only their own households, supervisors only their clusters;
  - admin-only IP visibility in the audit log.
- **Documents and uploads:**
  - uploads are checked by magic bytes;
  - storage objects use random keys and are never public;
  - bytes stream through the API after a scope check.
- **Sync and exports:**
  - idempotent sync, with 409s on stale revisions;
  - exports are protected against CSV formula injection.
- **Audit logging:** logins, reviews, edits, views, downloads and exports are all recorded.

## Production notes
- Set `NODE_ENV=production`, a strong `JWT_SECRET`, real `S3_*` settings, and serve over HTTPS behind a reverse proxy. `trust proxy` defaults to loopback; set `TRUST_PROXY=1` behind nginx / Railway / Cloudflare so the real client IP is recorded.
- Build with `npm run build`. Serve `apps/web/dist` as static files, proxy `/api` to `npm start`, and run `npm -w apps/api run migrate:deploy` on deploy.
- Never run `seed:demo` in production.

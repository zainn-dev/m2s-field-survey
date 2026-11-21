# Deployment Guide — M2S Field Survey

This guide covers containerized production deployment via Docker Compose and bare-metal/VM Node.js deployment.

## 1. Prerequisites

- **Secrets & Environment**: Copy [`.env.example`](../.env.example) and generate a strong random `JWT_SECRET` (32+ characters):
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```
- Never commit `.env` or leave `CHANGE_ME` values. Unset `DEMO_PASSWORD` in production (`npm run seed:demo` refuses to run when `NODE_ENV=production`).

## 2. Environment Variables

| Variable | Default / Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required | PostgreSQL 16 connection string |
| `JWT_SECRET` | Required (32+ chars) | HMAC signing key for `m2s_session` JWT cookies |
| `PORT` | `3000` | HTTP server port |
| `TRUST_PROXY` | `loopback` | Express proxy setting (`loopback`, hop count like `1`, `true`, `false`). Behind nginx, Railway, Render or Cloudflare set `1` (one hop). Client IP (`X-Forwarded-For`) and edge headers (`CF-Connecting-IP`, `X-Real-IP`, geo headers) are honoured **only** from a trusted proxy, so a wrong value records the proxy's IP instead of the volunteer's. |
| `COOKIE_SECURE` | Auto (`NODE_ENV=production`) | Session cookie `Secure` flag (`true` behind HTTPS, `false` only for plain-HTTP staging) |
| `CORS_ORIGINS` | Empty | Comma-separated origins if the web bundle is hosted on a separate origin |
| `SERVE_WEB_DIST` | Auto in production | Serves `apps/web/dist` and SPA history fallback from the API server |
| `STORAGE_DIR` | `.storage` (`/data/storage` in Docker) | Private local disk root for document bytes when S3 is unset |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Optional | S3-compatible object storage (MinIO, Cloudflare R2, AWS S3) |
| `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_STRICT` | Optional (`3310`, `true`) | Optional `clamd` TCP `INSTREAM` scanner; built-in EICAR & PDF active-action guards always run |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | First-time setup | Creates the initial `SUPER_ADMIN` (`14+` char password); clear after bootstrap |

## 3. Docker Compose Production Deployment

[`docker-compose.prod.yml`](../docker-compose.prod.yml) defines the core database and single-container web+API app, plus optional profiles:

- `proxy`: Nginx reverse proxy ([`deploy/nginx.conf`](../deploy/nginx.conf)) with `110m` upload limit and streaming ZIP support
- `clamav`: Dedicated ClamAV daemon container
- `minio`: Self-hosted S3-compatible object storage

### Steps

1. Export or place production variables in `.env` at the repository root (at minimum `POSTGRES_PASSWORD`, `JWT_SECRET`, and for first boot `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`).
2. Start database + application (add `--profile proxy`, `--profile clamav`, or `--profile minio` as needed):
   ```bash
   docker compose -f docker-compose.prod.yml --profile proxy up -d --build
   ```
3. On startup, [`deploy/docker-entrypoint.sh`](../deploy/docker-entrypoint.sh) automatically:
   - Runs `prisma migrate deploy`
   - Runs idempotent `node apps/api/dist/prisma/seed.js` (questionnaire, clusters, document categories)
   - Runs `node apps/api/dist/prisma/bootstrap-admin.js` if `BOOTSTRAP_ADMIN_*` variables are supplied
4. Remove `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` from `.env` once the initial `SUPER_ADMIN` has signed in, then recreate the `app` container (`docker compose -f docker-compose.prod.yml up -d app`).
5. For public HTTPS, place `fullchain.pem` and `privkey.pem` into `./deploy/certs` (or set `TLS_CERT_DIR`), enable the SSL server block and HTTPS redirect in [`deploy/nginx.conf`](../deploy/nginx.conf), and keep `COOKIE_SECURE=true` and `TRUST_PROXY=1`.

## 4. VM / Bare-Metal Node.js Deployment

1. Install Node.js 20+ and PostgreSQL 16.
2. Create `apps/api/.env` from [`.env.example`](../.env.example).
3. Install dependencies, generate Prisma client, build API + Web, apply migrations & seed:
   ```bash
   npm ci
   npx prisma generate --schema=apps/api/prisma/schema.prisma
   npm run build
   npm run setup
   npm run bootstrap-admin
   ```
4. Run the pre-flight verification script before starting under `systemd` or PM2:
   ```bash
   npm run deploy:check
   NODE_ENV=production npm start
   ```

## 5. Pre-Flight & Health Verification

- **`npm run deploy:check`**: Executes [`scripts/deploy-check.mjs`](../scripts/deploy-check.mjs) to verify `DATABASE_URL`, `JWT_SECRET`, compiled `dist/` outputs, writable storage or S3 credentials, ClamAV reachability (if configured), applied Prisma migrations, seeded questionnaire/clusters/categories, and active `SUPER_ADMIN` presence.
- **`GET /api/v1/health`**: Unauthenticated liveness check returning `ok`, active storage driver (`local` or `s3`), active scanner mode (`clamav` or `builtin`), `uptimeSec`, and ISO `time`.

## 6. Backups, Source Packaging & Maintenance

- **Database Backup & Restore**:
  - `npm run db:backup` — Exports a repeatable-read snapshot of all PostgreSQL tables into `backups/m2s-db-backup-<timestamp>.json` (pass `--sql` to also run `pg_dump` when installed).
  - `npm run db:restore -- --file backups/<backup>.json --yes` — Transactionally restores tables in foreign-key dependency order.
- **Document Blobs**: Back up `STORAGE_DIR` / `m2s_storage` volume (or enable bucket versioning on S3) in sync with DB backups.
- **Session Revocation**: Disabling a user or changing their password increments `tokenVersion` in PostgreSQL, revoking existing JWT cookies and Capacitor Bearer sessions immediately.
- **Clean Source Archive**: Run `npm run package:source` to generate `dist-release/m2s-field-survey-clean-src.zip` excluding `.env`, `.pgdata`, `.storage`, `backups`, `node_modules`, `dist`, Gradle caches, and APK binaries.

## 7. Building the Volunteer Android APK (`apps/mobile`)

1. Ensure JDK 17+ (`JAVA_HOME`) and Android SDK (`ANDROID_HOME`, platform API 34) are installed.
2. Build web assets, sync Capacitor plugins, and compile `app-debug.apk`:
   ```bash
   npm run mobile:apk
   ```
   Output APK path: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
3. Install on an attached Android device or emulator (`adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`). For local emulator testing, run `adb reverse tcp:3000 tcp:3000` or point the login screen's **API Server Configuration** to `http://10.0.2.2:3000` (for production APK releases, serve the API over HTTPS and disable `usesCleartextTraffic` in `AndroidManifest.xml`).


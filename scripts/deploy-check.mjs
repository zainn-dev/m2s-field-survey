/**
 * Pre-flight deployment verification script (`npm run deploy:check`).
 * Validates environment secrets, compiled artifacts, database migrations,
 * seed reference data, storage, scanner status, and active SUPER_ADMIN presence.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile(path.join(rootDir, 'apps/api/.env'));
loadEnvFile(path.join(rootDir, '.env'));

let fails = 0;
let warns = 0;

function pass(label, detail = '') {
  console.log(`[PASS] ${label}${detail ? ` - ${detail}` : ''}`);
}

function warn(label, detail = '') {
  warns += 1;
  console.warn(`[WARN] ${label}${detail ? ` - ${detail}` : ''}`);
}

function fail(label, detail = '') {
  fails += 1;
  console.error(`[FAIL] ${label}${detail ? ` - ${detail}` : ''}`);
}

function probeTcp(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl || dbUrl.includes('CHANGE_ME')) {
    fail('DATABASE_URL', 'Missing or still contains CHANGE_ME placeholder');
  } else {
    pass('DATABASE_URL', 'Configured');
  }

  const jwt = process.env.JWT_SECRET ?? '';
  if (jwt.length < 32 || jwt.includes('CHANGE_ME')) {
    fail('JWT_SECRET', 'Must be at least 32 characters and not a placeholder');
  } else {
    pass('JWT_SECRET', `Configured (${jwt.length} chars)`);
  }

  const artifacts = [
    'apps/api/dist/src/main.js',
    'apps/api/dist/prisma/seed.js',
    'apps/api/dist/prisma/bootstrap-admin.js',
    'apps/web/dist/index.html',
    'questionnaire/questionnaire.v1.json',
  ];
  const missingArtifacts = artifacts.filter((rel) => !fs.existsSync(path.join(rootDir, rel)));
  if (missingArtifacts.length > 0) {
    fail('Build artifacts', `Missing: ${missingArtifacts.join(', ')} (run npm run build)`);
  } else {
    pass('Build artifacts', 'API, Prisma scripts, Web dist, and questionnaire JSON present');
  }

  if (process.env.S3_BUCKET?.trim()) {
    if (!process.env.S3_ACCESS_KEY?.trim() || !process.env.S3_SECRET_KEY?.trim()) {
      fail('Object storage (S3)', 'S3_BUCKET is set but S3_ACCESS_KEY or S3_SECRET_KEY is missing');
    } else {
      pass('Object storage (S3)', `Bucket=${process.env.S3_BUCKET}`);
    }
  } else {
    const storageDir = path.resolve(rootDir, 'apps/api', process.env.STORAGE_DIR || '.storage');
    try {
      fs.mkdirSync(storageDir, { recursive: true });
      fs.accessSync(storageDir, fs.constants.W_OK);
      pass('Local storage', `Writable directory: ${storageDir}`);
    } catch (err) {
      fail('Local storage', `Cannot write ${storageDir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const clamHost = process.env.CLAMAV_HOST?.trim();
  if (clamHost) {
    const clamPort = Number(process.env.CLAMAV_PORT ?? 3310);
    const reachable = await probeTcp(clamHost, clamPort);
    if (reachable) {
      pass('Malware scanner', `ClamAV reachable at ${clamHost}:${clamPort}`);
    } else if (process.env.CLAMAV_STRICT === 'false') {
      warn('Malware scanner', `ClamAV unreachable at ${clamHost}:${clamPort} (CLAMAV_STRICT=false fallback active)`);
    } else {
      fail('Malware scanner', `ClamAV unreachable at ${clamHost}:${clamPort}`);
    }
  } else {
    warn('Malware scanner', 'CLAMAV_HOST unset; running built-in EICAR + PDF active-action checks only');
  }

  if (process.env.NODE_ENV === 'production' && process.env.DEMO_PASSWORD?.trim()) {
    warn('DEMO_PASSWORD', 'Set in environment; unset before deploying to production');
  }
  if (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'false') {
    warn('COOKIE_SECURE', 'Set to false in production; enable TLS + COOKIE_SECURE=true on public hosts');
  }

  if (dbUrl && !dbUrl.includes('CHANGE_ME')) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      pass('Database connection', 'SELECT 1 succeeded');

      const migrations = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `;
      const migCount = migrations?.[0]?.count ?? 0;
      if (migCount > 0) {
        pass('Database migrations', `${migCount} applied migration(s)`);
      } else {
        fail('Database migrations', 'No applied migrations found (run npm run setup)');
      }

      const [qvCount, clusterCount, docCatsSetting, superAdminCount] = await Promise.all([
        prisma.questionnaireVersion.count(),
        prisma.cluster.count(),
        prisma.setting.findUnique({ where: { key: 'docCategories' } }),
        prisma.user.count({ where: { role: 'SUPER_ADMIN', active: true } }),
      ]);

      const catCount = Array.isArray(docCatsSetting?.value) ? docCatsSetting.value.length : 0;
      if (qvCount > 0 && clusterCount > 0 && catCount > 0) {
        pass('Reference seed data', `questionnaires=${qvCount}, clusters=${clusterCount}, categories=${catCount}`);
      } else {
        fail('Reference seed data', 'Missing questionnaire/clusters/categories (run npm run setup)');
      }

      if (superAdminCount > 0) {
        pass('Admin bootstrap', `${superAdminCount} active SUPER_ADMIN user(s) present`);
      } else {
        fail(
          'Admin bootstrap',
          '0 active SUPER_ADMIN users in DB (set BOOTSTRAP_ADMIN_EMAIL + 14+ char BOOTSTRAP_ADMIN_PASSWORD and run npm run bootstrap-admin)'
        );
      }
    } catch (err) {
      fail('Database readiness', err instanceof Error ? err.message : String(err));
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log(`\nSummary: ${fails} failure(s), ${warns} warning(s).`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

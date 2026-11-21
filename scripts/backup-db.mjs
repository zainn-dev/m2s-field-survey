/**
 * Database Backup Utility (`npm run db:backup`)
 * Exports all PostgreSQL tables inside a single read snapshot transaction to a timestamped JSON archive
 * under `backups/`, and additionally creates a `.sql` dump if `pg_dump` is installed on PATH.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

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

const prismaPkgPath = require.resolve('@prisma/client', { paths: [path.join(rootDir, 'apps/api'), rootDir] });
const { PrismaClient } = require(prismaPkgPath);

const TABLE_ORDER = [
  { label: 'Setting', model: 'setting' },
  { label: 'QuestionnaireVersion', model: 'questionnaireVersion' },
  { label: 'User', model: 'user' },
  { label: 'Cluster', model: 'cluster' },
  { label: 'ClusterAssignment', model: 'clusterAssignment' },
  { label: 'Household', model: 'household' },
  { label: 'Survey', model: 'survey' },
  { label: 'Answer', model: 'answer' },
  { label: 'ReviewAction', model: 'reviewAction' },
  { label: 'Document', model: 'document' },
  { label: 'DocumentPage', model: 'documentPage' },
  { label: 'SyncRecord', model: 'syncRecord' },
  { label: 'AuditLog', model: 'auditLog' },
];

async function main() {
  const outArgIdx = process.argv.indexOf('--out');
  const backupsDir = path.join(rootDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath =
    outArgIdx > -1 && process.argv[outArgIdx + 1]
      ? path.resolve(rootDir, process.argv[outArgIdx + 1])
      : path.join(backupsDir, `m2s-db-backup-${stamp}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const prisma = new PrismaClient();
  try {
    const tables = {};
    const counts = {};

    await prisma.$transaction(
      async (tx) => {
        for (const { label, model } of TABLE_ORDER) {
          const rows = await tx[model].findMany();
          tables[label] = rows;
          counts[label] = Array.isArray(rows) ? rows.length : 0;
        }
      },
      { isolationLevel: 'Serializable' }
    );

    const payload = {
      format: 'm2s-prisma-logical-backup-v1',
      createdAt: new Date().toISOString(),
      tableOrder: TABLE_ORDER.map((t) => t.label),
      counts,
      tables,
    };

    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[BACKUP] Wrote database backup: ${outPath}`);
    console.log('[BACKUP] Row counts:', JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }

  // Optional native pg_dump if requested (--sql) and available on PATH
  if (process.argv.includes('--sql') && process.env.DATABASE_URL) {
    const sqlPath = outPath.replace(/\.json$/i, '.sql');
    const res = spawnSync('pg_dump', ['--clean', '--if-exists', '--no-owner', '--file', sqlPath, process.env.DATABASE_URL], {
      stdio: 'inherit',
    });
    if (res.error) {
      console.warn('[BACKUP] pg_dump binary not found on PATH; JSON logical backup remains complete and restorable via `npm run db:restore`.');
    } else if (res.status === 0) {
      console.log(`[BACKUP] Wrote pg_dump SQL snapshot: ${sqlPath}`);
    }
  }
}

main().catch((err) => {
  console.error('[BACKUP] Failed:', err.message);
  process.exit(1);
});

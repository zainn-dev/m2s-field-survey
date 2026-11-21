/**
 * Transactional Database Restore Utility (`npm run db:restore -- --file backups/<name>.json --yes`)
 * Validates the backup file first, then restores all tables in dependency order inside one atomic transaction.
 */
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

const MODEL_CLIENT_KEY = {
  Setting: 'setting',
  QuestionnaireVersion: 'questionnaireVersion',
  User: 'user',
  Cluster: 'cluster',
  ClusterAssignment: 'clusterAssignment',
  Household: 'household',
  Survey: 'survey',
  Answer: 'answer',
  ReviewAction: 'reviewAction',
  Document: 'document',
  DocumentPage: 'documentPage',
  SyncRecord: 'syncRecord',
  AuditLog: 'auditLog',
};

function reviveDates(table, row) {
  const out = { ...row };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (
      typeof v === 'string' &&
      /^(createdAt|updatedAt|submittedAt|reviewedAt|verifiedAt|uploadedAt|lastActive|gpsCapturedAt|startedAt)$/.test(k) &&
      /^\d{4}-\d{2}-\d{2}T/.test(v)
    ) {
      out[k] = new Date(v);
    }
  }
  if (table === 'Survey' && out.gpsConsent === null) out.gpsConsent = false;
  return out;
}

async function main() {
  const fileIdx = process.argv.indexOf('--file');
  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.argv.includes('--yes');

  if (fileIdx === -1 || !process.argv[fileIdx + 1]) {
    console.error('Usage: node scripts/restore-db.mjs --file backups/<backup>.json [--dry-run | --yes]');
    process.exit(1);
  }

  const backupPath = path.resolve(rootDir, process.argv[fileIdx + 1]);
  if (!fs.existsSync(backupPath)) {
    console.error(`[RESTORE] Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (backup.format !== 'm2s-prisma-logical-backup-v1' || !Array.isArray(backup.tableOrder) || !backup.tables) {
    console.error('[RESTORE] Invalid or unsupported backup file format.');
    process.exit(1);
  }

  console.log(`[RESTORE] Backup timestamp: ${backup.createdAt}`);
  console.log('[RESTORE] Backup counts:', JSON.stringify(backup.counts));

  if (dryRun) {
    console.log('[RESTORE] Dry-run verification passed.');
    return;
  }

  if (!confirmed) {
    console.error('[RESTORE] Aborted: pass --yes to overwrite database tables transactionally.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      // Clear tables in reverse dependency order
      for (const table of [...backup.tableOrder].reverse()) {
        const key = MODEL_CLIENT_KEY[table];
        if (!key) continue;
        await tx[key].deleteMany({});
      }

      // Restore rows in parent -> child order
      for (const table of backup.tableOrder) {
        const key = MODEL_CLIENT_KEY[table];
        const rows = backup.tables[table];
        if (!key || !Array.isArray(rows) || rows.length === 0) continue;
        await tx[key].createMany({
          data: rows.map((r) => reviveDates(table, r)),
        });
      }
    });
    console.log('[RESTORE] Transaction committed cleanly. Database restored.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[RESTORE] Failed (database rolled back cleanly):', err.message);
  process.exit(1);
});

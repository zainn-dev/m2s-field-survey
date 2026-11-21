// Local development Postgres without Docker.
// Starts a real PostgreSQL server (embedded-postgres binaries) using the credentials in DATABASE_URL,
// keeps its data in apps/api/.pgdata, and stays in the foreground until Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no extra dependency).
for (const file of [join(apiDir, '.env'), join(apiDir, '..', '..', '.env')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = new URL(process.env.DATABASE_URL ?? 'postgresql://m2s:m2s@localhost:5432/m2s');
const dbName = url.pathname.replace(/^\//, '') || 'm2s';
const dataDir = join(apiDir, '.pgdata');
const port = Number(url.port || 5432);

function isPortListening(p) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: p, host: '127.0.0.1' });
    let done = false;
    const finish = (open) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

const alreadyRunning = await isPortListening(port);
let pg = null;

if (alreadyRunning) {
  console.log(`[db] PostgreSQL ready on port ${port} (database "${dbName}")`);
} else {
  // Clean up stale postmaster.pid if postgres crashed previously
  const pidFile = join(dataDir, 'postmaster.pid');
  if (existsSync(pidFile)) {
    try {
      const pidStr = readFileSync(pidFile, 'utf8').split(/\r?\n/)[0]?.trim();
      const pid = Number(pidStr);
      let alive = false;
      if (pid && !Number.isNaN(pid)) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {}
      }
      if (!alive) {
        unlinkSync(pidFile);
        console.log('[db] removed stale postmaster.pid');
      }
    } catch {}
  }

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    port,
    persistent: true,
    // Force UTF-8: on Windows initdb otherwise picks WIN1252, which cannot store Hindi text.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });

  const fresh = !existsSync(join(dataDir, 'PG_VERSION'));
  if (fresh) {
    console.log('[db] initialising new cluster in', dataDir);
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase(dbName).catch(() => {}); // no-op if it already exists
  console.log(`[db] PostgreSQL ready on port ${port} (database "${dbName}")`);
}

const stop = async () => {
  console.log('\n[db] stopping…');
  if (pg) {
    await pg.stop().catch(() => {});
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// scripts/dev.mjs asks for a clean stop over IPC (Windows has no real SIGTERM).
process.on('message', (m) => m === 'shutdown' && stop());
setInterval(() => {}, 1 << 30);

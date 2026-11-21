// One-command local dev: embedded PostgreSQL -> API (watch) -> web (Vite).
// `node scripts/dev.mjs --no-db` skips the embedded database (e.g. when using docker compose).
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withDb = !process.argv.includes('--no-db');
const isWin = process.platform === 'win32';
const children = [];
const colors = { db: 35, api: 36, web: 32 };

function run(name, cwd, args, readyPattern) {
  return new Promise((resolve) => {
    // An IPC channel lets us ask each child to shut down cleanly (Windows has no real SIGTERM).
    const child = spawn(process.execPath, args, { cwd: join(root, cwd), env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.devName = name;
    children.push(child);
    let ready = !readyPattern;
    if (ready) resolve();
    const pipe = (stream, out) =>
      stream.on('data', (buf) => {
        const text = buf.toString();
        out.write(text.replace(/^(?=.)/gm, `\x1b[${colors[name]}m[${name}]\x1b[0m `));
        if (!ready && readyPattern.test(text)) {
          ready = true;
          resolve();
        }
      });
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on('exit', (code) => {
      child.exited = true;
      if (stopping) return;
      console.log(`[${name}] exited with code ${code}`);
      shutdown(code ?? 1);
    });
  });
}

/** Force-kills a process and everything it spawned (postgres.exe, tsc, node --watch, ...). */
function killTree(child) {
  if (child.exited || !child.pid) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  // Ask politely first (db stops PostgreSQL cleanly, api stops tsc + server)...
  for (const c of children) {
    if (c.exited) continue;
    try {
      if (c.connected) c.send('shutdown');
      else c.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  // ...then make sure nothing is left holding ports 5432 / 3000 / 5179. Stop the DB last.
  setTimeout(() => {
    for (const c of children.filter((c) => c.devName !== 'db')) killTree(c);
    setTimeout(() => {
      for (const c of children) killTree(c);
      process.exit(code);
    }, 1500);
  }, 2500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
// Windows raises SIGHUP when the console window is closed.
process.on('SIGHUP', () => shutdown(0));

// If whatever launched us (npm, a terminal, an IDE task) is force-killed, no signal arrives and the children would be
// orphaned holding ports 5432 / 3000 / 5179. Poll the parent and clean up when it disappears.
const parentPid = process.ppid;
const parentAlive = () => {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
setInterval(() => {
  if (!stopping && parentPid > 1 && !parentAlive()) shutdown(0);
}, 2000).unref();

const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (withDb) await run('db', 'apps/api', ['scripts/db.mjs'], /PostgreSQL ready/);
await run('api', 'apps/api', ['scripts/dev.mjs'], /Nest application successfully started|listening|localhost:\d+\/api/i);
await run('web', 'apps/web', [viteBin, '--port', '5179']);
console.log('\nOpen http://localhost:5179  (admin: /admin, field app: /volunteer)\n');

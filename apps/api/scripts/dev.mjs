// API dev runner: TypeScript watch build (keeps Nest decorator metadata) + node --watch on the output.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const tscBin = join(apiDir, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
const isWin = process.platform === 'win32';
let server = null;
let stopping = false;

const tsc = spawn(process.execPath, [tscBin, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], { cwd: apiDir });
tsc.stdout.on('data', (buf) => {
  const text = buf.toString();
  process.stdout.write(text.replace(/^/gm, '[tsc] '));
  if (!server && /Found 0 errors/.test(text)) {
    server = spawn(process.execPath, ['--watch', '--enable-source-maps', 'dist/src/main.js'], { cwd: apiDir, stdio: 'inherit' });
    server.on('exit', (code) => {
      if (!stopping) process.exit(code ?? 0);
    });
  }
});
tsc.stderr.pipe(process.stderr);

/** Kills a child and its descendants (node --watch runs the server in a grandchild). */
function killTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

const stop = () => {
  if (stopping) return;
  stopping = true;
  killTree(server);
  killTree(tsc);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// scripts/dev.mjs asks for a clean stop over IPC (Windows has no real SIGTERM).
process.on('message', (m) => m === 'shutdown' && stop());

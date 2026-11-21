import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Minimal .env loader (apps/api/.env, then repo-root .env). Real environment variables always win. */
// Compiled to apps/api/dist/src (or run from apps/api/src in tests), so probe both depths for each location.
const candidates = [
  join(__dirname, '..', '.env'), // src -> apps/api/.env
  join(__dirname, '..', '..', '.env'), // dist/src -> apps/api/.env
  join(__dirname, '..', '..', '..', '.env'), // src -> repo-root .env
  join(__dirname, '..', '..', '..', '..', '.env'), // dist/src -> repo-root .env
  join(process.cwd(), '.env'),
];
for (const file of [...new Set(candidates)]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

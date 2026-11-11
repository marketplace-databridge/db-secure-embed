#!/usr/bin/env node
// Adds allowlist.json to the built extension folder and zips it for QMC import.
// Refuses to package placeholder (example.*) allowlist entries unless --allow-placeholder is passed.
import { copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { normalizeAllowlist } from '../src/core/allowlist.js';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const dir = 'build/db-secure-embed';
if (!existsSync(dir)) throw new Error(`${dir} missing – run "npm run build && npm run sense" first`);

const list = normalizeAllowlist(JSON.parse(readFileSync('allowlist.json', 'utf8')));
if (!list.ok) throw new Error(`allowlist.json is invalid: ${list.errors.join(' ')}`);
list.errors.forEach((e) => console.warn(`allowlist warning: ${e}`));
const placeholders = list.entries.filter((e) =>
  e.origins.some((o) => /(^|\.)example\.(com|org|net)$/.test(o.host))
);
if (placeholders.length && !process.argv.includes('--allow-placeholder')) {
  console.error(
    `allowlist.json still contains placeholder entries: ${placeholders.map((e) => e.id).join(', ')}.\n` +
      'Replace them with the customer\'s approved sites, or pass --allow-placeholder for a test build.'
  );
  process.exit(1);
}

copyFileSync('allowlist.json', `${dir}/allowlist.json`);
const zip = `build/db-secure-embed_v${version}.zip`;
rmSync(zip, { force: true });
execFileSync('zip', ['-r', '-X', zip.split('/').pop(), 'db-secure-embed'], { cwd: 'build', stdio: 'inherit' });
console.log(`\nCreated ${zip} – import via QMC > Extensions > Import.`);

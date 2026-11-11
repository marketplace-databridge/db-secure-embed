#!/usr/bin/env node
// Prints the Content-Security-Policy frame-src header that matches allowlist.json,
// ready to paste into QMC > Virtual proxies > Additional response headers.
import { readFileSync } from 'node:fs';
import { normalizeAllowlist } from '../src/core/allowlist.js';

const file = process.argv[2] || 'allowlist.json';
const list = normalizeAllowlist(JSON.parse(readFileSync(file, 'utf8')));
if (!list.ok) {
  console.error(list.errors.join('\n'));
  process.exit(1);
}
list.errors.forEach((e) => console.error(`warning: ${e}`));
const sources = new Set(["'self'"]);
list.entries.forEach((e) =>
  e.origins.forEach((o) => {
    const defaultPort = o.scheme === 'https' ? '443' : '80';
    sources.add(`${o.scheme}://${o.wildcard ? '*.' : ''}${o.host}${o.port === defaultPort ? '' : `:${o.port}`}`);
  })
);
const value = `frame-src ${[...sources].join(' ')}`;
console.log('\nEnforce (after testing):');
console.log(`Content-Security-Policy: ${value}`);
console.log('\nTest first (report only, nothing is blocked):');
console.log(`Content-Security-Policy-Report-Only: ${value}\n`);

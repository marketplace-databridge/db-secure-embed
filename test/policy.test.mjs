import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAllowlist, findEntry, parseOriginPattern, resolveAllowlistUrl } from '../src/core/allowlist.js';
import { evaluate, resolveTemplate, parseUrl } from '../src/core/policy.js';

const allowlist = normalizeAllowlist({
  defaults: { referrerPolicy: 'strict-origin' },
  entries: [
    {
      id: 'youtube',
      label: 'YouTube',
      origins: ['https://www.youtube-nocookie.com'],
      pathPrefixes: ['/embed/'],
      maxSandbox: ['allow-scripts', 'allow-same-origin', 'allow-presentation', 'allow-popups'],
      allowFeatures: ['fullscreen', 'autoplay', 'encrypted-media', 'picture-in-picture'],
    },
    { id: 'corp', origins: ['https://*.intranet.example.com'], maxSandbox: ['allow-scripts', 'allow-top-navigation'] },
    { id: 'legacy', origins: ['http://old.example.com'] },
    { id: 'legacy-ok', origins: ['http://kiosk.example.com:8080'], allowInsecureHttp: true },
    { id: 'self', origins: ['https://qlik.example.org'], maxSandbox: ['allow-scripts', 'allow-same-origin'] },
  ],
});

const standard = { sandboxPreset: 'standard' };
const run = (rawUrl, security = standard) =>
  evaluate({ rawUrl, allowlist, security, selfOrigin: 'https://qlik.example.org' });

test('allowlist normalisation drops bad and forbidden things', () => {
  assert.equal(allowlist.ok, true);
  const ids = allowlist.entries.map((e) => e.id);
  assert.deepEqual(ids, ['youtube', 'corp', 'legacy-ok', 'self']);
  const corp = allowlist.entries.find((e) => e.id === 'corp');
  assert.deepEqual(corp.maxSandbox, ['allow-scripts']);
  assert.equal(corp.referrerPolicy, 'strict-origin');
  assert.ok(allowlist.errors.some((e) => e.includes('allow-top-navigation')));
  assert.ok(allowlist.errors.some((e) => e.includes('allowInsecureHttp')));
});

test('invalid allowlist documents fail closed', () => {
  assert.equal(normalizeAllowlist(null).ok, false);
  assert.equal(normalizeAllowlist({}).ok, false);
  const r = evaluate({ rawUrl: 'https://www.youtube-nocookie.com/embed/x', allowlist: { ok: false, entries: [] } });
  assert.equal(r.status, 'blocked');
  assert.equal(r.reason, 'allowlist-unavailable');
});

test('origin patterns', () => {
  assert.equal(parseOriginPattern('https://*.example.com').wildcard, true);
  assert.equal(parseOriginPattern('https://example.com:8443').port, '8443');
  assert.equal(parseOriginPattern('javascript:alert(1)'), null);
  assert.equal(parseOriginPattern('https://exa mple.com'), null);
  assert.equal(parseOriginPattern('https://example.com/path'), null);
});

test('allowed URL gets intersected sandbox, features and referrer', () => {
  const r = run('https://www.youtube-nocookie.com/embed/abc', {
    sandboxPreset: 'media',
    features: { fullscreen: true, 'clipboard-write': true },
  });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.sandbox, ['allow-scripts', 'allow-same-origin', 'allow-presentation', 'allow-popups']);
  assert.deepEqual(r.allow, ['fullscreen']);
  assert.equal(r.referrerPolicy, 'strict-origin');
  assert.ok(r.notes.some((n) => n.includes('clipboard-write')));
});

test('editor cannot exceed the allowlist entry', () => {
  const r = run('https://wiki.intranet.example.com/page', standard);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.sandbox, ['allow-scripts']);
});

test('path prefixes are enforced, including after dot-segment normalisation', () => {
  assert.equal(run('https://www.youtube-nocookie.com/watch?v=1').reason, 'not-on-allowlist');
  assert.equal(run('https://www.youtube-nocookie.com/embed/../watch').reason, 'not-on-allowlist');
  assert.equal(run('https://www.youtube-nocookie.com/embed/%2e%2e/watch').reason, 'not-on-allowlist');
});

test('path prefixes without trailing slash match whole segments only', () => {
  const list = normalizeAllowlist({ entries: [{ id: 'v', origins: ['https://player.vimeo.com'], pathPrefixes: ['/video'] }] });
  const ev = (u) => evaluate({ rawUrl: u, allowlist: list, security: standard }).status;
  assert.equal(ev('https://player.vimeo.com/video'), 'ok');
  assert.equal(ev('https://player.vimeo.com/video/123'), 'ok');
  assert.equal(ev('https://player.vimeo.com/videos-evil'), 'blocked');
});

test('host matching is exact and wildcard does not match apex or look-alikes', () => {
  assert.equal(run('https://intranet.example.com/').reason, 'not-on-allowlist');
  assert.equal(run('https://evil-intranet.example.com/').reason, 'not-on-allowlist');
  assert.equal(run('https://wiki.intranet.example.com.evil.io/').reason, 'not-on-allowlist');
  assert.equal(run('https://www.youtube-nocookie.com.evil.io/embed/').reason, 'not-on-allowlist');
  assert.equal(run('https://WWW.YOUTUBE-NOCOOKIE.COM/embed/x').status, 'ok');
  assert.equal(run('https://www.youtube-nocookie.com:8443/embed/x').reason, 'not-on-allowlist');
});

test('dangerous schemes and credentials are rejected', () => {
  for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'file:///c:/x', 'vbscript:x', 'blob:https://a/b']) {
    assert.equal(run(u).status, 'blocked', u);
  }
  assert.equal(run('/relative/path').reason, 'invalid-url');
  assert.equal(run('https://user:pw@wiki.intranet.example.com/').reason, 'credentials-in-url');
  assert.equal(run('https://user@wiki.intranet.example.com/').reason, 'credentials-in-url');
  assert.equal(run('https://x.intranet.example.com/' + 'a'.repeat(5000)).reason, 'too-long');
  assert.equal(run('   ').status, 'empty');
});

test('http is blocked unless the entry opts in', () => {
  assert.equal(run('http://wiki.intranet.example.com/').reason, 'insecure-http');
  assert.equal(run('http://old.example.com/').reason, 'not-on-allowlist');
  assert.equal(run('http://kiosk.example.com:8080/board').status, 'ok');
});

test('same-origin guard strips allow-same-origin for the Qlik server itself', () => {
  const r = run('https://qlik.example.org/extensions/mashup/index.html', standard);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.sandbox, ['allow-scripts']);
  assert.ok(r.notes.some((n) => n.includes('Qlik server')));
});

test('locked and custom presets', () => {
  assert.deepEqual(run('https://www.youtube-nocookie.com/embed/x', { sandboxPreset: 'locked' }).sandbox, []);
  const r = run('https://www.youtube-nocookie.com/embed/x', {
    sandboxPreset: 'custom',
    custom: { 'allow-scripts': true, 'allow-top-navigation': true, 'allow-modals': true },
  });
  assert.deepEqual(r.sandbox, ['allow-scripts']);
});

test('referrer policy: editor may only tighten, unsafe values ignored', () => {
  assert.equal(run('https://www.youtube-nocookie.com/embed/x', { referrerPolicy: 'no-referrer' }).referrerPolicy, 'no-referrer');
  const loose = run('https://www.youtube-nocookie.com/embed/x', { referrerPolicy: 'origin' });
  assert.equal(loose.referrerPolicy, 'strict-origin');
  assert.ok(loose.notes.some((n) => n.includes('less strict')));
  assert.equal(
    run('https://www.youtube-nocookie.com/embed/x', { referrerPolicy: 'unsafe-url' }).referrerPolicy,
    'strict-origin'
  );
});

test('URL templates encode values and cannot change the host', () => {
  assert.deepEqual(resolveTemplate('https://r.example.com/region/{region}?y={year}', [
    { name: 'region', value: 'Wien Süd' },
    { name: 'year', value: 2026 },
  ]), { url: 'https://r.example.com/region/Wien%20S%C3%BCd?y=2026' });
  const inj = resolveTemplate('https://r.example.com/{p}', [{ name: 'p', value: '@evil.io/x?y=1#z' }]);
  assert.equal(new URL(inj.url).host, 'r.example.com');
  assert.ok(resolveTemplate('https://{host}/x', [{ name: 'host', value: 'evil.io' }]).error);
  assert.ok(resolveTemplate('{u}', [{ name: 'u', value: 'https://evil.io' }]).error);
  assert.ok(resolveTemplate('https://r.example.com{p}', [{ name: 'p', value: '.evil.io' }]).error);
  assert.ok(resolveTemplate('https://r.example.com/{missing}', []).error);
  assert.ok(resolveTemplate('https://r.example.com/a/{p}', [{ name: 'p', value: '../../admin' }]).error);
  assert.ok(resolveTemplate('https://r.example.com/a/{p}', [{ name: 'p', value: '..' }]).error);
  assert.equal(resolveTemplate('https://r.example.com/a?q={p}', [{ name: 'p', value: 'a..b' }]).url, 'https://r.example.com/a?q=a..b');
  assert.deepEqual(resolveTemplate('', []), { url: '' });
});

test('template errors surface as blocked', () => {
  const r = evaluate({ rawUrl: '', templateError: 'bad', allowlist, security: standard });
  assert.equal(r.reason, 'template-error');
});

test('parseUrl strips whitespace and rejects odd input', () => {
  assert.ok(parseUrl('  https://a.b/  ').url);
  assert.equal(parseUrl(null).reason, 'empty');
  assert.equal(parseUrl('https://').reason, 'invalid-url');
});

test('allowlist URL resolution', () => {
  const win = { location: { pathname: '/vp1/sense/app/abc/sheet/x/state/analysis' } };
  assert.equal(resolveAllowlistUrl('db-secure-embed', win), '/vp1/extensions/db-secure-embed/allowlist.json');
  const win2 = { location: { pathname: '/sense/app/abc' }, require: { toUrl: (p) => `/resources/../${p}` } };
  assert.equal(resolveAllowlistUrl('db-secure-embed', win2), '/resources/../extensions/db-secure-embed/allowlist.json');
  // A page-level global must never redirect the allowlist.
  assert.equal(
    resolveAllowlistUrl('x', { __DBSE_ALLOWLIST_URL__: 'https://evil.io/t.json', location: { pathname: '/' } }),
    '/extensions/x/allowlist.json'
  );
});

test('findEntry respects default ports', () => {
  const e = findEntry(new URL('https://www.youtube-nocookie.com:443/embed/x'), allowlist.entries);
  assert.equal(e.id, 'youtube');
});

test('malformed pathPrefixes drop the entry instead of opening the whole origin', () => {
  for (const pathPrefixes of [['embed/'], '/embed/', [42]]) {
    const list = normalizeAllowlist({ entries: [{ id: 'y', origins: ['https://www.youtube.com'], pathPrefixes }] });
    assert.equal(list.entries.length, 0, JSON.stringify(pathPrefixes));
    assert.ok(list.errors.some((e) => e.includes('pathPrefixes')));
  }
});

test('non-array maxSandbox and numeric ids do not crash normalisation', () => {
  const list = normalizeAllowlist({ entries: [{ id: 7, label: 9, origins: ['https://a.example.org'], maxSandbox: 'allow-scripts' }] });
  assert.equal(list.entries[0].id, '7');
  assert.equal(list.entries[0].label, '9');
  assert.deepEqual(list.entries[0].maxSandbox, ['allow-scripts', 'allow-forms', 'allow-popups']);
});

test('encoded traversal cannot pass a path prefix', () => {
  assert.equal(run('https://www.youtube-nocookie.com/embed/..%2Fwatch').reason, 'not-on-allowlist');
  assert.equal(run('https://www.youtube-nocookie.com/embed/..%5Cwatch').reason, 'not-on-allowlist');
  assert.equal(run('https://www.youtube-nocookie.com/embed/a%2Fb').status, 'ok');
  assert.equal(run('https://www.youtube-nocookie.com/embed/a..b').status, 'ok');
});

test('same-origin guard also strips allow-popups-to-escape-sandbox', () => {
  const list = normalizeAllowlist({
    entries: [{ id: 's', origins: ['https://qlik.example.org'], maxSandbox: ['allow-scripts', 'allow-popups', 'allow-popups-to-escape-sandbox'] }],
  });
  const r = evaluate({
    rawUrl: 'https://qlik.example.org/x.html',
    allowlist: list,
    security: { sandboxPreset: 'custom', custom: { 'allow-scripts': true, 'allow-popups': true, 'allow-popups-to-escape-sandbox': true } },
    selfOrigin: 'https://qlik.example.org',
  });
  assert.deepEqual(r.sandbox, ['allow-scripts', 'allow-popups']);
});

test('template placeholders never resolve to Object.prototype members', () => {
  assert.ok(resolveTemplate('https://r.example.com/{constructor}', []).error);
  assert.ok(resolveTemplate('https://r.example.com/x?a={toString}', []).error);
});

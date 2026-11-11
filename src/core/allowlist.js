import {
  SANDBOX_TOKENS,
  FORBIDDEN_SANDBOX_TOKENS,
  DEFAULT_MAX_SANDBOX,
  FEATURES,
  REFERRER_POLICIES,
  DEFAULT_REFERRER_POLICY,
} from './constants.js';

const ORIGIN_PATTERN = /^(https?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?\/?$/;

/**
 * Parses an origin pattern such as "https://www.youtube-nocookie.com" or
 * "https://*.example.com:8443". A leading "*." matches any subdomain depth,
 * but not the apex domain itself.
 */
export function parseOriginPattern(pattern) {
  if (typeof pattern !== 'string') return null;
  const m = ORIGIN_PATTERN.exec(pattern.trim().toLowerCase());
  if (!m) return null;
  const [, scheme, wildcard, host, port] = m;
  if (port && (Number(port) < 1 || Number(port) > 65535)) return null;
  return {
    scheme,
    wildcard: Boolean(wildcard),
    host,
    port: port || (scheme === 'https' ? '443' : '80'),
    source: pattern.trim(),
  };
}

function pickList(value, universe, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((v) => universe.includes(v));
}

/**
 * Validates and normalises a raw allowlist.json document. Invalid entries are
 * dropped (and reported) rather than failing the whole list.
 */
export function normalizeAllowlist(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) {
    return { ok: false, entries: [], errors: ['allowlist.json must be an object with an "entries" array.'] };
  }
  const defaults = raw.defaults || {};
  const defaultReferrer = REFERRER_POLICIES.includes(defaults.referrerPolicy)
    ? defaults.referrerPolicy
    : DEFAULT_REFERRER_POLICY;

  const entries = [];
  raw.entries.forEach((e, i) => {
    const id = String((e && e.id) || `entry-${i + 1}`);
    if (!e || !Array.isArray(e.origins) || e.origins.length === 0) {
      errors.push(`${id}: "origins" must be a non-empty array.`);
      return;
    }
    const origins = [];
    e.origins.forEach((o) => {
      const parsed = parseOriginPattern(o);
      if (!parsed) errors.push(`${id}: invalid origin pattern "${o}".`);
      else if (parsed.scheme === 'http' && e.allowInsecureHttp !== true)
        errors.push(`${id}: "${o}" is http:// but "allowInsecureHttp" is not true; ignored.`);
      else origins.push(parsed);
    });
    if (origins.length === 0) return;

    const forbidden = (Array.isArray(e.maxSandbox) ? e.maxSandbox : []).filter((t) => FORBIDDEN_SANDBOX_TOKENS.includes(t));
    if (forbidden.length) errors.push(`${id}: forbidden sandbox tokens ignored: ${forbidden.join(', ')}.`);

    // Fail closed: a malformed pathPrefixes must not silently widen the entry to the whole origin.
    const pathPrefixes = e.pathPrefixes === undefined ? [] : e.pathPrefixes;
    if (!Array.isArray(pathPrefixes) || !pathPrefixes.every((p) => typeof p === 'string' && p.startsWith('/'))) {
      errors.push(`${id}: "pathPrefixes" must be an array of paths starting with "/"; entry ignored.`);
      return;
    }

    entries.push({
      id,
      label: String(e.label || id),
      origins,
      pathPrefixes,
      maxSandbox: pickList(e.maxSandbox, SANDBOX_TOKENS, DEFAULT_MAX_SANDBOX),
      allowFeatures: pickList(e.allowFeatures, FEATURES, []),
      referrerPolicy: REFERRER_POLICIES.includes(e.referrerPolicy) ? e.referrerPolicy : defaultReferrer,
      allowInsecureHttp: e.allowInsecureHttp === true,
    });
  });

  return { ok: true, entries, errors, defaultReferrer };
}

function hostMatches(pattern, hostname) {
  if (!pattern.wildcard) return hostname === pattern.host;
  return hostname.endsWith(`.${pattern.host}`);
}

/** "/video" matches "/video" and "/video/…", never "/videos-evil". */
function pathMatches(prefix, pathname) {
  if (prefix.endsWith('/')) return pathname.startsWith(prefix);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function effectivePort(url) {
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

/** True when the decoded path has a ".." segment (e.g. "/embed/..%2Fwatch"); some servers decode %2F. */
function hasEncodedTraversal(pathname) {
  try {
    return /(^|[/\\])\.\.([/\\]|$)/.test(decodeURIComponent(pathname));
  } catch (e) {
    return true;
  }
}

/** Returns the first allowlist entry that permits `url` (a URL object), or null. */
export function findEntry(url, entries) {
  const scheme = url.protocol.replace(':', '');
  const hostname = url.hostname.toLowerCase();
  const port = effectivePort(url);
  const traversal = hasEncodedTraversal(url.pathname);
  return (
    entries.find(
      (entry) =>
        entry.origins.some((o) => o.scheme === scheme && o.port === port && hostMatches(o, hostname)) &&
        (entry.pathPrefixes.length === 0 || (!traversal && entry.pathPrefixes.some((p) => pathMatches(p, url.pathname))))
    ) || null
  );
}

/**
 * Works out where allowlist.json is served from. The file lives in the
 * extension folder, which only Qlik administrators can change (QMC import),
 * so app editors cannot widen it.
 */
export function resolveAllowlistUrl(extName, win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return null;
  // No page-level override on purpose: any other script on the page could
  // otherwise point the extension at a more permissive allowlist.
  const req = win.requirejs || win.require;
  if (req && typeof req.toUrl === 'function') {
    try {
      const u = req.toUrl(`extensions/${extName}/allowlist.json`);
      if (u && !/^extensions\//.test(u)) return u;
    } catch (e) {
      /* fall through */
    }
  }
  const m = /^(.*?)\/(sense|single|hub|dev-hub)\//.exec(win.location.pathname);
  const prefix = m ? m[1] : '';
  return `${prefix}/extensions/${extName}/allowlist.json`;
}

let cache = null;

/** Loads (once per page) and normalises the allowlist. Fails closed. */
export function loadAllowlist(extName, fetchImpl) {
  if (cache) return cache;
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const url = resolveAllowlistUrl(extName);
  if (!f || !url) {
    cache = Promise.resolve({ ok: false, entries: [], errors: ['No allowlist location available.'] });
    return cache;
  }
  cache = f(url, { credentials: 'same-origin', cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} loading ${url}`);
      return r.json();
    })
    .then((json) => normalizeAllowlist(json))
    .catch((err) => {
      cache = null; // allow a retry on the next render
      return { ok: false, entries: [], errors: [String(err && err.message ? err.message : err)] };
    });
  return cache;
}

export function resetAllowlistCache() {
  cache = null;
}

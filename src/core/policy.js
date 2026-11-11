import {
  SANDBOX_PRESETS,
  SANDBOX_TOKENS,
  FEATURES,
  REFERRER_POLICIES,
  MAX_URL_LENGTH,
  REASONS,
} from './constants.js';
import { findEntry } from './allowlist.js';

const TEMPLATE_ORIGIN = /^https?:\/\/[^/?#{}]+[/?#]/i;
const PLACEHOLDER = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Resolves a URL template such as
 *   https://reports.example.com/region/{region}?year={year}
 * Parameter values are URL-encoded and may only appear after the origin, so
 * data or expressions can never change which site is loaded.
 */
export function resolveTemplate(template, params) {
  const t = (template || '').trim();
  if (!t) return { url: '' };
  if (!TEMPLATE_ORIGIN.test(t)) {
    return { error: 'The template must start with a fixed https://host/ before any {placeholder}.' };
  }
  const values = Object.create(null); // no prototype: "{constructor}" must not resolve
  (params || []).forEach((p) => {
    if (p && p.name) values[p.name] = p.value == null ? '' : String(p.value);
  });
  const missing = [];
  const traversal = [];
  const pathEnd = t.search(/[?#]/);
  const url = t.replace(PLACEHOLDER, (_, name, offset) => {
    if (!(name in values)) {
      missing.push(name);
      return '';
    }
    // In the path, "..": some servers decode %2F, so "../" could climb out of an allowed prefix.
    if ((pathEnd === -1 || offset < pathEnd) && values[name].includes('..')) traversal.push(name);
    return encodeURIComponent(values[name]);
  });
  if (missing.length) return { error: `No parameter defined for: ${missing.join(', ')}.` };
  if (traversal.length) return { error: `Parameter value contains "..": ${traversal.join(', ')}.` };
  return { url };
}

/** Parses and checks a URL string without consulting the allowlist. */
export function parseUrl(raw) {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!s) return { reason: REASONS.EMPTY };
  if (s.length > MAX_URL_LENGTH) return { reason: REASONS.TOO_LONG };
  let url;
  try {
    url = new URL(s); // no base: relative URLs are rejected
  } catch (e) {
    return { reason: REASONS.INVALID_URL };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { reason: REASONS.BAD_SCHEME };
  if (url.username || url.password) return { reason: REASONS.CREDENTIALS };
  return { url };
}

function editorSandbox(security) {
  const preset = (security && security.sandboxPreset) || 'standard';
  if (preset === 'custom') {
    const custom = (security && security.custom) || {};
    return SANDBOX_TOKENS.filter((t) => custom[t] === true);
  }
  return SANDBOX_PRESETS[preset] || SANDBOX_PRESETS.standard;
}

function editorFeatures(security) {
  const f = (security && security.features) || {};
  return FEATURES.filter((x) => f[x] === true);
}

/**
 * The policy engine. Combines what the editor asked for with what the
 * administrator's allowlist entry permits; the result is always the
 * intersection, never more than either side.
 *
 * @returns {{status:'ok'|'blocked'|'empty', reason?:string, detail?:string,
 *            url?:string, origin?:string, entry?:object, sandbox?:string[],
 *            allow?:string[], referrerPolicy?:string, notes:string[]}}
 */
export function evaluate({ rawUrl, templateError, allowlist, security, selfOrigin }) {
  const notes = [];
  if (templateError) return { status: 'blocked', reason: REASONS.TEMPLATE, detail: templateError, notes };

  const parsed = parseUrl(rawUrl);
  if (parsed.reason === REASONS.EMPTY) return { status: 'empty', reason: REASONS.EMPTY, notes };
  if (parsed.reason) return { status: 'blocked', reason: parsed.reason, notes };
  const { url } = parsed;

  if (!allowlist || !allowlist.ok) {
    return {
      status: 'blocked',
      reason: REASONS.ALLOWLIST_UNAVAILABLE,
      detail: allowlist && allowlist.errors ? allowlist.errors.join(' ') : undefined,
      notes,
    };
  }

  const entry = findEntry(url, allowlist.entries);
  if (!entry) {
    if (url.protocol === 'http:') {
      const https = new URL(url.href);
      https.protocol = 'https:';
      if (findEntry(https, allowlist.entries)) return { status: 'blocked', reason: REASONS.INSECURE, notes };
    }
    return { status: 'blocked', reason: REASONS.NOT_ALLOWED, detail: url.host, notes };
  }

  let sandbox = editorSandbox(security).filter((t) => entry.maxSandbox.includes(t));
  const requested = editorSandbox(security).filter((t) => !entry.maxSandbox.includes(t));
  if (requested.length) notes.push(`Not permitted by allowlist entry "${entry.label}": ${requested.join(', ')}`);

  // Same-origin guard: a frame with scripts + same-origin on Qlik's own origin
  // could remove its own sandbox and act with the user's Qlik session. An
  // unsandboxed pop-up of the same page would do the same.
  if (selfOrigin && url.origin === selfOrigin) {
    const unsafe = sandbox.filter((t) => t === 'allow-same-origin' || t === 'allow-popups-to-escape-sandbox');
    if (unsafe.length) {
      sandbox = sandbox.filter((t) => !unsafe.includes(t));
      notes.push(`${unsafe.join(', ')} removed: target is the Qlik server itself.`);
    }
  }

  const allow = editorFeatures(security).filter((f) => entry.allowFeatures.includes(f));
  const deniedFeatures = editorFeatures(security).filter((f) => !entry.allowFeatures.includes(f));
  if (deniedFeatures.length) notes.push(`Features not permitted: ${deniedFeatures.join(', ')}`);

  // The editor may only pick a policy at least as strict as the entry's.
  const editorReferrer = security && security.referrerPolicy;
  let referrerPolicy = entry.referrerPolicy;
  if (editorReferrer && editorReferrer !== 'default' && REFERRER_POLICIES.includes(editorReferrer)) {
    if (REFERRER_POLICIES.indexOf(editorReferrer) <= REFERRER_POLICIES.indexOf(entry.referrerPolicy)) {
      referrerPolicy = editorReferrer;
    } else {
      notes.push(`Referrer "${editorReferrer}" is less strict than the allowlist entry; using "${entry.referrerPolicy}".`);
    }
  }

  return {
    status: 'ok',
    url: url.href,
    origin: url.origin,
    entry,
    sandbox,
    allow,
    referrerPolicy,
    notes,
  };
}

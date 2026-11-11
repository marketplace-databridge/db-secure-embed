/**
 * Security vocabulary for DataBridge Secure Embed.
 *
 * Anything not listed here can never reach the iframe, regardless of what an
 * app editor or the allowlist asks for.
 */

/** Sandbox tokens that may ever be granted. */
export const SANDBOX_TOKENS = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
  'allow-downloads',
  'allow-presentation',
  'allow-pointer-lock',
  'allow-orientation-lock',
];

/**
 * Tokens that are never granted. Top-level navigation is what allows an
 * embedded (or compromised) page to redirect the whole Qlik tab.
 */
export const FORBIDDEN_SANDBOX_TOKENS = [
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
  'allow-storage-access-by-user-activation',
];

/** What an allowlist entry grants when it does not say otherwise. */
export const DEFAULT_MAX_SANDBOX = ['allow-scripts', 'allow-forms', 'allow-popups'];

/** Editor presets. "custom" uses the per-token switches in the property panel. */
export const SANDBOX_PRESETS = {
  locked: [],
  standard: ['allow-scripts', 'allow-same-origin', 'allow-forms', 'allow-popups'],
  media: ['allow-scripts', 'allow-same-origin', 'allow-presentation', 'allow-popups'],
};

/** Permissions-Policy features that may be delegated to the frame (iframe `allow`). */
export const FEATURES = [
  'fullscreen',
  'autoplay',
  'encrypted-media',
  'picture-in-picture',
  'clipboard-write',
  'web-share',
];

/**
 * Referrer policies that never leak the full Qlik URL (app / sheet ids) to
 * another site, ordered strictest first. The policy engine relies on this order.
 */
export const REFERRER_POLICIES = [
  'no-referrer',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'origin',
];

export const DEFAULT_REFERRER_POLICY = 'no-referrer';

export const MAX_URL_LENGTH = 4096;
export const MIN_REFRESH_SECONDS = 15;

/** Reason codes returned by the policy engine. */
export const REASONS = {
  EMPTY: 'empty',
  ALLOWLIST_UNAVAILABLE: 'allowlist-unavailable',
  INVALID_URL: 'invalid-url',
  TOO_LONG: 'too-long',
  BAD_SCHEME: 'bad-scheme',
  CREDENTIALS: 'credentials-in-url',
  INSECURE: 'insecure-http',
  NOT_ALLOWED: 'not-on-allowlist',
  TEMPLATE: 'template-error',
};

export const REASON_TEXT = {
  [REASONS.EMPTY]: 'No web address configured yet.',
  [REASONS.ALLOWLIST_UNAVAILABLE]:
    'The embed allowlist could not be loaded, so all embedding is blocked (fail-closed). Check allowlist.json in the extension folder.',
  [REASONS.INVALID_URL]: 'The web address is not a valid absolute URL.',
  [REASONS.TOO_LONG]: 'The web address is too long.',
  [REASONS.BAD_SCHEME]: 'Only https:// web addresses can be embedded.',
  [REASONS.CREDENTIALS]: 'Web addresses containing a username or password are not allowed.',
  [REASONS.INSECURE]: 'Plain http:// is not allowed for this site. Use https://.',
  [REASONS.NOT_ALLOWED]: 'This site is not on the approved embed allowlist.',
  [REASONS.TEMPLATE]: 'The URL template could not be resolved.',
};

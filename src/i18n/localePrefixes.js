// The URL prefixes under which localized editions live (`/he/...`), as plain
// JS so build scripts that run under Node without a TypeScript loader
// (scripts/precacheFilter.mjs) can read them. documentationLocales.ts is the
// registry; localePrefixes.test.js fails if the two ever disagree, so this is
// a mirror with a guard, not a second source of truth.
export const LOCALIZED_PATH_PREFIXES = Object.freeze([
  'he',
  'hi',
  'fil',
  'fr-ca',
  'ms',
  'ar',
  'zh-hans',
  'es-co',
  'prs-af',
  'ps-af',
  'ta',
]);

/** True for a dist-relative path or a site path that sits under a locale prefix. */
export function isLocalizedPath(pathOrRelative) {
  const [first, second] = pathOrRelative.replace(/^\//, '').split('/');
  return Boolean(second) && LOCALIZED_PATH_PREFIXES.includes(first);
}

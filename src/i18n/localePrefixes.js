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
  'id',
]);

/** True for a dist-relative path or a site path that sits under a locale prefix. */
export function isLocalizedPath(pathOrRelative) {
  const [first, second] = pathOrRelative.replace(/^\//, '').split('/');
  return Boolean(second) && LOCALIZED_PATH_PREFIXES.includes(first);
}

// LOC-06: the pilot country per locale, for the per-locale country breakdown
// in scripts/seo-refresh.mjs (a site-wide country average hides a locale
// whose whole audience is one country). documentationLocales.ts carries no
// country field on purpose - a documentation locale is a language, not a
// country - so this is a small, separate map rather than something derived
// from that registry. Add a row here when a new locale's pilot country is
// decided; a locale absent here gets no country breakdown.
export const PILOT_COUNTRY_BY_PREFIX = Object.freeze({
  he: 'Israel',
  id: 'Indonesia',
});

import { DEFAULT_FONT_FAMILY, FONT_MANIFEST } from '../lib/fonts/fontManifest.ts';

/**
 * ARCH-22: this is product behaviour, not build tooling - it decides what
 * the service worker downloads eagerly at install versus caches only on
 * first use, i.e. what works offline after exactly one visit. It lives here
 * under src/site-lib/ rather than in scripts/ for that reason
 * (docs/module-boundaries.md). Its consumers: scripts/generate-precache-manifest.mjs
 * imports shouldPrecache() and runs it, after `astro build`, over every file
 * in dist/, to render the result into dist/precache-manifest.json.
 * public/sw.js never imports this module - it is registered as a classic
 * script and only ever reads that generated JSON at install time.
 *
 * Which built assets the service worker downloads before anyone asks for
 * them. Everything omitted here still enters the runtime cache on first use.
 *
 * MEM-15/MEM-18: the install caches the whole app, as the union of the build's
 * closures: a shell (`/` and what every page shares) plus the closure of each
 * HTML page (scripts/precacheClosure.mjs, listed in the manifest). Files no
 * page reaches are not installed. This filter decides which files may appear
 * in any of those lists, so a tool works offline after one visit.
 *
 * Fonts are mostly excluded. Declared with `@font-face`
 * (src/styles/editorFonts.css), a browser fetches a TTF only when a rule
 * actually matches text on the page, so precaching the whole catalogue would
 * spend a visitor's bandwidth on files almost none of them will select -
 * measured before the 2026-08-27 change at 8.42 MB across 33 files, more
 * than double the app's own non-font weight, and still growing with every
 * script added. They stay cacheable on demand instead: sw.js's fetch handler
 * is cache-first for every same-origin asset and stores anything it had to
 * go to the network for, so a font a visitor actually uses is cached from
 * that first use and works offline after.
 *
 * The default family's normal face is the one exception, because it is what
 * the editor renders with before anyone chooses anything (`DEFAULT_FONT_FAMILY`
 * in src/lib/fonts/fontManifest.ts, currently Arimo). Without it, a visitor who opens
 * Sign for the very first time and goes offline before typing (or before
 * their typed text triggers a different font) has no embeddable font at
 * all: `signPdf`'s fetch fails, `loadCustomFont` returns null, and
 * `serialize` throws rather than degrading. A missing *bold* face degrades
 * gracefully by comparison, because `loadCustomFont` already falls back to
 * Regular - which is why this keep-list is one face rather than one family,
 * and why it's read off `faces.normal` rather than every entry the
 * manifest's (currently unused) `precache` flag would pull in.
 *
 * Localized pages (`/he/...`, `/id/...`) are part of the whole-app install
 * like any other page: each is cached with its own closure.
 */
const defaultFontEntry = FONT_MANIFEST.find((font) => font.family === DEFAULT_FONT_FAMILY);
/** @testSeam */
export const PRECACHED_FONTS = [`fonts/${defaultFontEntry.faces.normal}`];

// The Scan guide's photos (about 750 KB) are shown only on a controlled page and cached then, at runtime.
const RUNTIME_ONLY_IMAGE_DIRS = ['/images/scan-guide/'];

export function shouldPrecache(relative, { manifestName, workerName }) {
  if (relative === manifestName || relative === workerName) return false;
  if (relative.startsWith('fonts/')) return PRECACHED_FONTS.includes(relative);
  if (RUNTIME_ONLY_IMAGE_DIRS.some((dir) => `/${relative}`.startsWith(dir))) return false;
  return true;
}

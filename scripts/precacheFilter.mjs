/**
 * @file precacheFilter.mjs
 * @description Which built assets the service worker downloads before anyone
 * asks for them.
 *
 * Split out of generate-precache-manifest.mjs purely so it can be unit
 * tested: that script's body needs a real `dist/` and throws without one, so
 * importing it from a test would mean building first. The rule this file
 * holds is a delivery-behaviour invariant rather than a build detail, and it
 * is worth pinning.
 */

/**
 * The one font worth downloading before anyone asks for it.
 *
 * Every other bundled face is excluded. Fonts are declared with `@font-face`
 * (src/styles/editorFonts.css) and a browser fetches a TTF only when a rule
 * actually matches text, so precaching the catalogue spends a visitor's
 * bandwidth on files almost none of them will select. Measured before this
 * filter: 12.16 MB precached in total, 8.42 MB of it fonts across 33 files,
 * on a site whose entire non-font payload is 3.74 MB. Six faces were added on
 * 2026-08-27 and grew it further, and a CJK face would add roughly 2 MB more.
 *
 * They stay cacheable on demand: sw.js's fetch handler is cache-first for
 * every same-origin asset and stores anything it had to go to the network for
 * (its branch 2), so a font the visitor actually picks is cached from first
 * use and works offline afterwards.
 *
 * Arimo Regular is the exception because it is `DEFAULT_FAMILY` in
 * src/lib/fonts.js, which is what the editor renders with before anyone
 * chooses anything. Without it, a visitor who installs the app and goes
 * offline before ever opening the editor has no embeddable font at all:
 * `signPdf`'s fetch fails, `loadCustomFont` returns null, and `serialize`
 * throws rather than degrading. A missing *bold* face degrades gracefully by
 * comparison, because `loadCustomFont` already falls back to Regular, which
 * is why this keep-list is one file rather than one family.
 */
export const PRECACHED_FONTS = ['fonts/Arimo-Regular.ttf'];

/**
 * True when `relative` (a dist-relative, forward-slashed path) belongs in the
 * precache manifest.
 *
 * The manifest and the worker are excluded because the worker fetches the
 * manifest itself and a 404 on it is what tells an orphaned worker to
 * uninstall, so caching either would defeat that.
 */
export function shouldPrecache(relative, { manifestName, workerName }) {
  if (relative === manifestName || relative === workerName) return false;
  if (relative.startsWith('fonts/')) return PRECACHED_FONTS.includes(relative);
  return true;
}

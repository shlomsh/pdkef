/**
 * Which built assets the service worker downloads before anyone asks for
 * them. Everything omitted here still enters the runtime cache on first use.
 *
 * Everything in dist/ is precached except fonts. Two things force this back
 * to "the whole shell," not just tool-page HTML:
 *
 * 1. A service worker can never intercept the navigation that first
 *    registers it - by the time 'load' fires and registration begins, that
 *    document request (and every subresource it triggered, including a
 *    `client:load` island's own hydration bundle) has already gone out
 *    uncontrolled and uncached. So a page shell alone is not enough to
 *    reopen a tool offline after exactly one visit: the HTML would be
 *    there, but its island's JS would 404 from the runtime cache and the
 *    tool would never hydrate. Only precaching the JS/CSS a page needs,
 *    alongside its HTML, actually closes the gap - and per-page dependency
 *    graphs aren't information this filter has, so the reliable version of
 *    that is "precache the app."
 * 2. This is a reversion to the pre-2026-08-27 policy, which precached
 *    everything (measured then at 4.23 MB non-font across ~69 entries) and
 *    was working; the SIGN-07 review found the later change - which
 *    additionally dropped every page's HTML and JS down to precaching only
 *    `/` - broke offline-after-one-visit for every route, not just the
 *    documentation pages it meant to stop precaching.
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
 * Arimo Regular is the one exception, because it is `DEFAULT_FAMILY` in
 * src/editor/text/fonts.js - what the editor renders with before anyone
 * chooses anything. Without it, a visitor who opens Sign for the very first time
 * and goes offline before typing (or before their typed text triggers a
 * different font) has no embeddable font at all: `signPdf`'s fetch fails,
 * `loadCustomFont` returns null, and `serialize` throws rather than
 * degrading. A missing *bold* face degrades gracefully by comparison,
 * because `loadCustomFont` already falls back to Regular - which is why
 * this keep-list is one file rather than one family.
 */
export const PRECACHED_FONTS = ['fonts/Arimo-Regular.ttf'];

export function shouldPrecache(relative, { manifestName, workerName }) {
  if (relative === manifestName || relative === workerName) return false;
  if (relative.startsWith('fonts/')) return PRECACHED_FONTS.includes(relative);
  return true;
}

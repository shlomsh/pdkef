import { PRECACHED_FONT_FILES } from './font-manifest.mjs';

/**
 * Which built assets the service worker downloads before anyone asks for
 * them. Everything omitted here still enters the runtime cache on first use.
 */

/** Fonts are fetched and cached only when the active tool actually uses them. */
export const PRECACHED_FONTS = PRECACHED_FONT_FILES.map((file) => `fonts/${file}`);

/**
 * The root document is the small offline navigation fallback. Tool pages,
 * documentation pages, and their code/media are route payloads—not a global
 * app shell—and enter the runtime cache only after the visitor requests them.
 */
export const PRECACHED_PAGE_HTML = new Set(['index.html']);

export function shouldPrecache(relative, { manifestName, workerName }) {
  if (relative === manifestName || relative === workerName) return false;
  if (PRECACHED_FONTS.includes(relative)) return true;
  return PRECACHED_PAGE_HTML.has(relative);
}

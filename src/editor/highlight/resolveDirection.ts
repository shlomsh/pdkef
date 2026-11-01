// Which way a highlight swipe reads: the text under the press (none on a scan), else the page's
// detected text direction, else the direction most pages with text have, else the most recent typed text, else the reader's
// language, else left to right.
import { getEffectiveTextDirection, pageTextDirection } from '../text/textDirection.js';
import type { ReadingDirection } from '#lib/pageLayout/bands.ts';

interface PercentRun { str: string; left: number; top: number; width: number; height: number }

interface MaybeText { type: string; text?: string; textDirection?: ReadingDirection }

const RTL_LANGUAGES = new Set(['he', 'ar', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv']);

function languageDirection(tag: string): ReadingDirection {
  const [primary, ...rest] = tag.toLowerCase().split('-');
  if (RTL_LANGUAGES.has(primary)) return 'rtl';
  return primary === 'ku' && rest.includes('arab') ? 'rtl' : 'ltr';
}

/** The reader's direction: an rtl document (the /he/ pages), else their first browser language. */
export function readerTextDirection(
  env: { documentDir?: string; languages?: readonly string[] } = {
    documentDir: typeof document === 'undefined' ? '' : document.documentElement.dir,
    languages: typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]),
  },
): ReadingDirection {
  if (env.documentDir === 'rtl') return 'rtl';
  const first = env.languages?.find(Boolean);
  return first ? languageDirection(first) : 'ltr';
}

/** The direction of the printed text at a page-percent point: the nearest run on that row that has letters. */
export function directionAtPoint(
  runs: ReadonlyArray<PercentRun>,
  point: { x: number; y: number },
): ReadingDirection | undefined {
  const gap = (run: PercentRun) => Math.max(run.left - point.x, point.x - (run.left + run.width), 0);
  const row = runs.filter((run) => point.y >= run.top && point.y <= run.top + run.height);
  for (const run of row.sort((a, b) => gap(a) - gap(b))) {
    const direction = pageTextDirection([run.str]);
    if (direction) return direction;
  }
  return undefined;
}

export function resolveHighlightDirection({ atPress, page, pages, elements, readerDirection }: {
  atPress?: ReadingDirection;
  page: ReadingDirection | undefined;
  pages: ReadonlyArray<ReadingDirection | undefined>;
  elements: readonly MaybeText[];
  readerDirection: ReadingDirection;
}): ReadingDirection {
  if (atPress) return atPress;
  if (page) return page;
  let rtl = 0;
  let ltr = 0;
  for (const direction of pages) {
    if (direction === 'rtl') rtl += 1;
    else if (direction === 'ltr') ltr += 1;
  }
  if (rtl !== ltr) return rtl > ltr ? 'rtl' : 'ltr';
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (el.type === 'text' && el.text) return getEffectiveTextDirection(el);
  }
  return readerDirection;
}

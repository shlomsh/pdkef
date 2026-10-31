// Which way a highlight swipe reads: the page's detected text direction (none for a scan), else
// the direction most pages with text have, else the most recent typed text, else the reader's
// language, else left to right.
import { getEffectiveTextDirection } from '#editor/text/textDirection.js';
import type { ReadingDirection } from './bands.ts';

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

export function resolveHighlightDirection({ page, pages, elements, readerDirection }: {
  page: ReadingDirection | undefined;
  pages: ReadonlyArray<ReadingDirection | undefined>;
  elements: readonly MaybeText[];
  readerDirection: ReadingDirection;
}): ReadingDirection {
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

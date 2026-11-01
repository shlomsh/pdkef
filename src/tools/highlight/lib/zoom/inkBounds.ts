import type { TextRow } from '#lib/pageLayout/textRows.ts';

const MIN_ROW_WIDTH = 0.08;
const MIN_ROWS = 3;
const MIN_SPAN = 0.3;
const TRIM = 0.1;

/**
 * Where a page's text sits left to right, from its rendered rows, as fractions of the page width. The 10th
 * percentile of the row lefts and the 90th of the rights keep a page number or a margin note out of it.
 * Null when there is too little text to say.
 */
export function inkTextBounds(rows: TextRow[], widthPx: number): { left: number; right: number } | null {
  const kept = rows.filter((r) => (r.right - r.left) / widthPx >= MIN_ROW_WIDTH);
  if (kept.length < MIN_ROWS) return null;
  const lefts = kept.map((r) => r.left).sort((a, b) => a - b);
  const rights = kept.map((r) => r.right).sort((a, b) => a - b);
  const cut = Math.floor(TRIM * kept.length);
  const left = lefts[cut] / widthPx;
  const right = rights[kept.length - 1 - cut] / widthPx;
  return right - left < MIN_SPAN ? null : { left, right };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** One text span for the whole document: the median left and the median right of the pages that had one. */
export function medianBounds(perPage: Array<{ left: number; right: number } | null>): { left: number; right: number } | null {
  const found = perPage.filter((b): b is { left: number; right: number } => b !== null);
  return found.length ? { left: median(found.map((b) => b.left)), right: median(found.map((b) => b.right)) } : null;
}

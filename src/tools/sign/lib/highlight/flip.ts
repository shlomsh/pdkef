// Flipping a highlight's reading direction: recover the swipe from its bands and re-lay the end rows.
import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { Band } from './bands.ts';
import { highlightGeometry } from './swipe.ts';

interface Point { x: number; y: number }

/** The swipe's press and release in page percent, read back from the first and last bands. */
export function swipeEnds(el: HighlightElement): { start: Point; end: Point } {
  const page = [...el.bands].sort((a, b) => a.top - b.top).map((b) => ({
    left: el.left + (b.left / 100) * el.width,
    right: el.left + ((b.left + b.width) / 100) * el.width,
    y: el.top + ((b.top + b.height / 2) / 100) * el.height,
  }));
  const first = page[0];
  const last = page[page.length - 1];
  return el.direction === 'rtl'
    ? { start: { x: first.right, y: first.y }, end: { x: last.left, y: last.y } }
    : { start: { x: first.left, y: first.y }, end: { x: last.right, y: last.y } };
}

/** The patch for the other direction: new bands too when the passage spans rows and they can be read. */
export function flipChanges(el: HighlightElement, bandsBetween?: (a: Point, b: Point) => Band[]) {
  const direction = el.direction === 'rtl' ? 'ltr' : 'rtl';
  if (el.bands.length < 2 || !bandsBetween) return { direction } as const;
  const { start, end } = swipeEnds(el);
  const geometry = highlightGeometry(bandsBetween(start, end));
  return geometry ? { ...geometry, direction } as const : { direction } as const;
}

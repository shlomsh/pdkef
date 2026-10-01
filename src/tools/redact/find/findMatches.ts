import type { PageGlyph } from '../../../editor/adapters/pdf/pageGlyphs.ts';
import type { PageGeometry } from '../../../editor/geometry/coords.ts';
import { matchBoxes, type MatchBoxShape, type MeasureText } from './matchBoxes.ts';
import type { FindMatch, Finder, PageText, PercentBox } from './types.ts';

export interface SearchablePage {
  text: PageText;
  geometry: PageGeometry;
  /** RED-15: the page's glyphs (`readPageGlyphs`), so a match is boxed on its
   * real letters. Absent or null where the page's glyphs were not read or
   * could not be, and the box is then estimated from the text item. */
  glyphs?: readonly PageGlyph[] | null;
}

/** Every range `finder` proposes on every page, in page then reading order,
 * each with its boxes. A range that yields no box (only separators) is dropped. */
export function findMatches(pages: readonly SearchablePage[], finder: Finder, measure?: MeasureText, shape?: MatchBoxShape): FindMatch[] {
  return pages.flatMap(({ text, geometry, glyphs }) => finder(text.text).flatMap((range) => {
    const boxes = matchBoxes(text, range, geometry, measure, shape, glyphs);
    if (boxes.length === 0) return [];
    return [{
      id: `${text.pageIndex}:${range.start}`,
      pageIndex: text.pageIndex,
      start: range.start,
      end: range.end,
      text: text.text.slice(range.start, range.end),
      boxes,
    }];
  }));
}

/** Whether `inner` lies inside `outer`, with a small tolerance in percent. */
function contains(outer: PercentBox, inner: PercentBox, slack = 0.2): boolean {
  return inner.left >= outer.left - slack
    && inner.top >= outer.top - slack
    && inner.left + inner.width <= outer.left + outer.width + slack
    && inner.top + inner.height <= outer.top + outer.height + slack;
}

/** Whether every box of `match` already sits under one of `covers` on its page,
 * so the find panel can show it as done instead of proposing it again. */
export function isCovered(
  match: FindMatch,
  covers: readonly ({ pageIndex: number } & PercentBox)[],
): boolean {
  return match.boxes.every((box) => covers.some((cover) => cover.pageIndex === match.pageIndex && contains(cover, box)));
}

/**
 * RED-17: the matches no box hides yet, each with its generous cover boxes.
 * Whether a box hides a match is judged on the letters' own extent
 * (`core`), so a tightly drawn box counts; a match only partly hidden is
 * still open.
 */
export function uncoveredMatches(
  pages: readonly SearchablePage[],
  finder: Finder,
  covers: readonly ({ pageIndex: number } & PercentBox)[],
  measure?: MeasureText,
): FindMatch[] {
  const hidden = new Set(findMatches(pages, finder, measure, 'core').filter((match) => isCovered(match, covers)).map((match) => match.id));
  return findMatches(pages, finder, measure).filter((match) => !hidden.has(match.id));
}

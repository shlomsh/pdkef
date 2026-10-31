// SIGN-44 comments view: which highlights show a comment card on a page, where each card wants
// to sit, and where a passage ends (the dot). Pure; page-percent in, page-percent out.
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { hasComment } from './commentNumbers.ts';

export interface PercentBox { left: number; top: number; width: number; height: number }

export interface CommentCard {
  id: string;
  color: string;
  comment: string;
  /** Opened with Comment and nothing typed yet: the card shows an empty field. */
  isNew: boolean;
  /** The first band in page percent: where the card wants to sit and the passage crop's source. */
  firstBand: PercentBox;
}

/** A band of a highlight (percent of its own box) in page percent. */
function bandToPage(element: HighlightElement, band: PercentBox): PercentBox {
  return {
    left: element.left + (band.left / 100) * element.width,
    top: element.top + (band.top / 100) * element.height,
    width: (band.width / 100) * element.width,
    height: (band.height / 100) * element.height,
  };
}

const isHighlight = (el: EditorElement): el is HighlightElement => el.type === 'highlight';

/**
 * Cards for one page in reading order (top, then left): every highlight with a comment, plus the
 * active highlight when its comment was just opened ('' or blank).
 */
export function commentCards(elements: readonly EditorElement[], pageIndex: number, activeId: string | null): CommentCard[] {
  return elements
    .filter(isHighlight)
    .filter((el) => el.pageIndex === pageIndex && el.bands.length > 0)
    .filter((el) => !!el.comment?.trim() || (el.id === activeId && el.comment !== undefined))
    .map((el) => ({
      id: el.id,
      color: el.color,
      comment: el.comment ?? '',
      isNew: !el.comment?.trim(),
      firstBand: bandToPage(el, el.bands[0]),
    }))
    .sort((a, b) => a.firstBand.top - b.firstBand.top || a.firstBand.left - b.firstBand.left);
}

/** Commented highlights on one page (the page header's count). */
export function commentCount(elements: readonly EditorElement[], pageIndex: number): number {
  return elements.filter((el) => el.pageIndex === pageIndex && hasComment(el)).length;
}

/**
 * Card tops in px: each card at the top it wants, pushed down below the one before it with `gap`
 * between, in the order given. `want` and `height` are px.
 */
export function stackCards(cards: ReadonlyArray<{ id: string; want: number; height: number }>, gap: number): Map<string, number> {
  const tops = new Map<string, number>();
  let floor = -Infinity;
  for (const card of cards) {
    const top = Math.max(card.want, floor);
    tops.set(card.id, top);
    floor = top + card.height + gap;
  }
  return tops;
}

/** Where the passage ends, in page percent: the end of its last band in reading order, mid-height. */
export function passageEnd(element: HighlightElement): { x: number; y: number } {
  const last = element.bands[element.bands.length - 1];
  const box = bandToPage(element, last ?? { left: 0, top: 0, width: 100, height: 100 });
  return { x: element.direction === 'rtl' ? box.left : box.left + box.width, y: box.top + box.height / 2 };
}

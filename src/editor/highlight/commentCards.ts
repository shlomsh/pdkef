// SIGN-44 comments view: which comments show a card on a page, where each card wants to sit, and
// where a comment's anchor ends (the dot). Pure; page-percent in, page-percent out.
import type { CommentElement, EditorElement } from '../model/editorModel.ts';
import { isComment, resolveCommentBoxes } from '../comments/anchors.ts';
import { hasComment } from './commentNumbers.ts';

interface PercentBox { left: number; top: number; width: number; height: number }

export interface CommentCard {
  id: string;
  /** The passage's reading direction: the crop starts where the line is read first. */
  direction: 'ltr' | 'rtl';
  comment: string;
  /** When the comment was last written (epoch ms); absent on comments made before dates were kept. */
  commentedAt?: number;
  /** Opened and nothing typed yet: the card shows an empty field. */
  isNew: boolean;
  /** Where the card wants to sit: the passage's first band in page percent, else the comment's box. */
  firstBand: PercentBox;
}

/** A band of a passage comment (percent of its own box) in page percent. */
function bandToPage(element: PercentBox, band: PercentBox): PercentBox {
  return {
    left: element.left + (band.left / 100) * element.width,
    top: element.top + (band.top / 100) * element.height,
    width: (band.width / 100) * element.width,
    height: (band.height / 100) * element.height,
  };
}

const directionOf = (el: CommentElement): 'ltr' | 'rtl' => (el.anchor.kind === 'passage' ? el.anchor.direction ?? 'ltr' : 'ltr');
/** A comment still being placed (its box is empty until the gesture commits) opens no card, so the rail never reflows the page under a swipe. */
const isBeingPlaced = (el: CommentElement): boolean => el.comment === '' && el.width === 0 && el.height === 0;
const cardsOf = (elements: readonly EditorElement[], activeId: string | null): CommentElement[] =>
  resolveCommentBoxes(elements).filter(isComment).filter((el) => !!el.comment.trim() || (el.id === activeId && el.comment === '' && !isBeingPlaced(el)));

/** Any card on any page: the rail opens with the first comment, never for highlighting alone. */
export function hasCommentCards(elements: readonly EditorElement[], activeId: string | null): boolean {
  return cardsOf(elements, activeId).length > 0;
}

/**
 * Cards for one page in reading order (top, then left): every comment with text, plus the active
 * comment while it is new.
 */
export function commentCards(elements: readonly EditorElement[], pageIndex: number, activeId: string | null): CommentCard[] {
  return cardsOf(elements, activeId)
    .filter((el) => el.pageIndex === pageIndex)
    .map((el) => ({
      id: el.id,
      direction: directionOf(el),
      comment: el.comment,
      commentedAt: el.commentedAt,
      isNew: !el.comment.trim(),
      firstBand: el.anchor.kind === 'passage' && el.anchor.bands.length > 0 ? bandToPage(el, el.anchor.bands[0]) : { left: el.left, top: el.top, width: el.width, height: el.height },
    }))
    .sort((a, b) => a.firstBand.top - b.firstBand.top || a.firstBand.left - b.firstBand.left);
}

/** Comments with text on one page (the page header's count). */
export function commentCount(elements: readonly EditorElement[], pageIndex: number): number {
  return resolveCommentBoxes(elements).filter((el) => el.pageIndex === pageIndex && hasComment(el)).length;
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

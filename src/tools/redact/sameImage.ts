import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';

export interface SameImage {
  /** Every draw of the picked image that is not deleted yet. */
  rest: DeletablePdfObject[];
  /** How many other pages draw it. */
  otherPages: number;
}

/**
 * RED-26: the rest of an image the person just deleted one draw of. Matches
 * by `imageRef` (the same picture file reused on several pages, a logo or a
 * letterhead), skipping the picked draw and anything already marked.
 */
export function restOfImage(
  all: readonly DeletablePdfObject[],
  markedIds: ReadonlySet<string>,
  picked: DeletablePdfObject,
): SameImage {
  if (picked.kind !== 'image' || !picked.imageRef) return { rest: [], otherPages: 0 };
  const rest = all.filter((o) => (
    o.kind === 'image' && o.imageRef === picked.imageRef && o.id !== picked.id && !markedIds.has(o.id)
  ));
  const otherPages = new Set(rest.map((o) => o.pageIndex).filter((p) => p !== picked.pageIndex)).size;
  return { rest, otherPages };
}

/** The undo chip text for one deleted image that other pages also draw. */
export function sharedImageMessage(otherPages: number): string {
  return `Deleted an image, also on ${otherPages} other ${otherPages === 1 ? 'page' : 'pages'}`;
}

export const EVERY_PAGE_MESSAGE = 'Deleted the image on every page';

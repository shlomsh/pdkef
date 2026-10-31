import type { CommentElement, EditorElement, HighlightBand } from '#editor/model/editorModel.ts';

type Direction = 'ltr' | 'rtl';

/** Where a comment's marker sits, in percent of its (resolved) box, and which way the text there reads. */
export interface CommentMarker { left: number; top: number; direction: Direction }

/** True for a comment element. */
export function isComment(element: EditorElement): element is CommentElement {
  return element.type === 'comment';
}

/** The comments whose anchor is the element `id`. @testSeam until the comment views consume it; then drop the tag. */
export function commentsAnchoredTo(elements: readonly EditorElement[], id: string): CommentElement[] {
  return elements.filter((el): el is CommentElement => isComment(el) && el.anchor.kind === 'element' && el.anchor.elementId === id);
}

/** The snapshot predicate every delete call site uses: the element and the comments anchored to it go (and come back) together. */
export function deletedWith(id: string): (element: EditorElement) => boolean {
  return (el) => el.id === id || (isComment(el) && el.anchor.kind === 'element' && el.anchor.elementId === id);
}

/** A target's box in percent of its page; a line has endpoints, a text box may have no stored size. */
function boxOfTarget(target: EditorElement): { left: number; top: number; width: number; height: number } {
  if (target.type === 'line') {
    return {
      left: Math.min(target.x1, target.x2), top: Math.min(target.y1, target.y2),
      width: Math.abs(target.x2 - target.x1), height: Math.abs(target.y2 - target.y1),
    };
  }
  return { left: target.left, top: target.top, width: target.width ?? 0, height: 'height' in target ? target.height : 0 };
}

/**
 * An element comment takes its target's box and page; one whose target is gone is dropped. Every
 * other element passes through untouched, so the result keeps the input order.
 */
export function resolveCommentBoxes(elements: readonly EditorElement[]): EditorElement[] {
  const byId = new Map(elements.map((el) => [el.id, el]));
  return elements.flatMap((el) => {
    if (!isComment(el) || el.anchor.kind !== 'element') return [el];
    const target = byId.get(el.anchor.elementId);
    return target ? [{ ...el, pageIndex: target.pageIndex, ...boxOfTarget(target) }] : [];
  });
}

/** Where a passage ends, in percent of its own box: the end of its last band in reading order, mid-height. */
function passageEnd(bands: readonly HighlightBand[], direction: Direction = 'ltr'): CommentMarker {
  const last = bands[bands.length - 1] ?? { left: 0, top: 0, width: 100, height: 100 };
  return { left: direction === 'rtl' ? last.left : last.left + last.width, top: last.top + last.height / 2, direction };
}

/**
 * Every comment's marker, keyed by comment id: a passage's at its end in reading order, a comment on a
 * highlight at that highlight's passage end, on any other element at its top right corner. A pin has
 * none: the pin is its own marker.
 */
export function commentMarkers(elements: readonly EditorElement[]): ReadonlyMap<string, CommentMarker> {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const markers = new Map<string, CommentMarker>();
  for (const el of elements) {
    if (!isComment(el)) continue;
    const { anchor } = el;
    if (anchor.kind === 'passage') markers.set(el.id, passageEnd(anchor.bands, anchor.direction));
    if (anchor.kind !== 'element') continue;
    const target = byId.get(anchor.elementId);
    if (!target) continue;
    markers.set(el.id, target.type === 'highlight' ? passageEnd(target.bands, target.direction) : { left: 100, top: 0, direction: 'ltr' });
  }
  return markers;
}

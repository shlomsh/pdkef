// SIGN-44: a highlight's comment number, shared by the badge on screen and the exported PDF.
import type { EditorElement, HighlightElement } from './editorModel.ts';

/** True when the highlight carries a comment with something in it. */
export function hasComment(element: EditorElement): element is HighlightElement {
  return element.type === 'highlight' && !!element.comment?.trim();
}

/** Where the passage starts, in page percent: the top of its first band. */
function startTop(element: HighlightElement): number {
  const band = element.bands[0];
  return element.top + ((band?.top ?? 0) / 100) * element.height;
}

/** Commented highlights numbered 1..n in reading order: page, then from the top, then from the left. */
export function commentNumbers(elements: readonly EditorElement[]): ReadonlyMap<string, number> {
  const ordered = elements.filter(hasComment).sort((a, b) =>
    a.pageIndex - b.pageIndex || startTop(a) - startTop(b) || a.left - b.left);
  return new Map(ordered.map((element, i) => [element.id, i + 1]));
}

// Which way a highlight swipe reads: the page's detected text direction, else the document's
// most recent typed text, else left to right.
import { getEffectiveTextDirection } from '#editor/text/textDirection.js';
import type { ReadingDirection } from './bands.ts';

interface MaybeText { type: string; text?: string; textDirection?: ReadingDirection }

export function resolveHighlightDirection(
  pageDirection: ReadingDirection | undefined,
  elements: readonly MaybeText[],
): ReadingDirection {
  if (pageDirection) return pageDirection;
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const el = elements[i];
    if (el.type === 'text' && el.text) return getEffectiveTextDirection(el);
  }
  return 'ltr';
}

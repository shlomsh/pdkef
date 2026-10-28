import type { EditorElement } from '#editor/model/editorModel.ts';

/** How far a pasted copy sits from the original, in percent of the page, and how far it may travel. */
const PASTE_OFFSET_PCT = 4;
const LINE_MAX_PCT = 100;
const BOX_MAX_PCT = 90;

/** What the system clipboard gets when an element is copied: its text, or a `[type]` placeholder. */
export function clipboardText(element: EditorElement): string {
  return element.type === 'text' ? element.text : `[${element.type}]`;
}

/** The copy a paste adds: the element under a new id, nudged down and right and kept on the page. */
export function offsetClone(original: EditorElement, id: string): EditorElement {
  if (original.type === 'line') {
    return {
      ...original,
      id,
      x1: Math.min(LINE_MAX_PCT, original.x1 + PASTE_OFFSET_PCT),
      y1: Math.min(LINE_MAX_PCT, original.y1 + PASTE_OFFSET_PCT),
      x2: Math.min(LINE_MAX_PCT, original.x2 + PASTE_OFFSET_PCT),
      y2: Math.min(LINE_MAX_PCT, original.y2 + PASTE_OFFSET_PCT),
    };
  }
  return {
    ...original,
    id,
    left: Math.min(BOX_MAX_PCT, original.left + PASTE_OFFSET_PCT),
    top: Math.min(BOX_MAX_PCT, original.top + PASTE_OFFSET_PCT),
  };
}

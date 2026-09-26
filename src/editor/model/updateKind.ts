import {
  captureElementUpdate,
  createActionEntry,
  type ElementUpdate,
  type HistoryElement,
  type UpdateHistoryEntry,
} from './actionHistory.ts';

/** What a person did to an element, as far as its history label is concerned. */
export type ElementUpdateKind = 'move' | 'resize' | 'text' | 'style';

export const UPDATE_ENTRY_TYPES: Record<ElementUpdateKind, string> = {
  move: 'MOVE_ELEMENT',
  resize: 'RESIZE_ELEMENT',
  text: 'EDIT_TEXT',
  style: 'STYLE_ELEMENT',
};

const POSITION_KEYS = new Set(['left', 'top']);
const ENDPOINT_KEYS = new Set(['x1', 'y1', 'x2', 'y2']);
// A text box's resize drag commits `fontSize`, so A-/A+ read as a resize too.
const SIZE_KEYS = new Set(['width', 'height', 'fontSize']);
const TRANSLATION_EPSILON = 1e-6;

/** A line whose two endpoints moved by the same amount was dragged, not reshaped. */
function isTranslation(update: ElementUpdate): boolean {
  const before = update.before as Record<string, unknown>;
  const after = update.after as Record<string, unknown>;
  const delta = (key: string) => (key in after ? Number(after[key]) - Number(before[key]) : 0);
  return Math.abs(delta('x1') - delta('x2')) < TRANSLATION_EPSILON
    && Math.abs(delta('y1') - delta('y2')) < TRANSLATION_EPSILON;
}

/**
 * Names a captured change from the fields it touched. Typing is a `text`
 * change (a retyped date included, which drops its format); picking a date
 * format also rewrites `text` but is a `style` change, because it sets
 * `dateFormatId`. A change of shape type is `style` even though it rewrites
 * geometry.
 */
export function classifyElementUpdate(update: ElementUpdate): ElementUpdateKind {
  const after = update.after as Record<string, unknown>;
  const keys = Object.keys(after);
  if (keys.every((key) => POSITION_KEYS.has(key))) return 'move';
  if (keys.every((key) => ENDPOINT_KEYS.has(key))) return isTranslation(update) ? 'move' : 'resize';
  if ('text' in after && typeof after.dateFormatId !== 'string') return 'text';
  if (!('type' in after) && keys.some((key) => SIZE_KEYS.has(key))) return 'resize';
  return 'style';
}

/**
 * The one way either tool turns an element change into a history entry, or
 * null when the change changes nothing. `describe` supplies the label in the
 * tool's own words. `editSession` names the open text edit session, if any;
 * it only groups `text` changes, so a style tweak made mid-session is still
 * its own step.
 */
export function createUpdateEntry<TElement extends HistoryElement>(
  element: TElement,
  changes: Partial<TElement>,
  describe: (kind: ElementUpdateKind) => string,
  editSession?: string,
): UpdateHistoryEntry<TElement> | null {
  const update = captureElementUpdate(element, changes);
  if (!update) return null;
  const kind = classifyElementUpdate(update as ElementUpdate);
  return createActionEntry<TElement>({
    operation: 'update',
    type: UPDATE_ENTRY_TYPES[kind],
    pageIndex: element.pageIndex,
    description: describe(kind),
    updates: [update],
    ...(kind === 'text' && editSession ? { group: editSession } : {}),
  });
}

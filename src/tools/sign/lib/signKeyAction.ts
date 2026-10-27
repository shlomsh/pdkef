/** What a keydown on the window means for the Sign editor. */
export type SignKeyAction =
  | { kind: 'finish-editing' }
  | { kind: 'clear-selection' }
  | { kind: 'field-next' }
  | { kind: 'field-previous' }
  | { kind: 'edit-selected' }
  | { kind: 'delete-active' }
  | { kind: 'none' };

export interface SignKeyContext {
  key: string;
  shiftKey: boolean;
  /** `document.activeElement?.tagName`. */
  activeTag: string | undefined;
  editingElementId: string | null;
  activeElementId: string | null;
  /** Fill mode (docs/sign-fill-mode.md) leaves Tab to the browser. */
  fillEnabled: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  /** The selected element is a text box. */
  selectedIsText: boolean;
}

/**
 * Classifies a keydown. Pure: the hook owns the listener and the effects.
 *
 * Escape unwinds one level at a time: out of the text box first, then out of
 * the selection and tool. Collapsing both into one press would make it
 * impossible to go from typing to "this box is selected", which is the state
 * Backspace-to-delete needs.
 *
 * Tab / Shift+Tab move field-to-field - the desktop equivalent of the phone's
 * Next/Previous control (MOBI-06). Gated on `activeElementId`, the same tier
 * Backspace/Delete are on rather than requiring an open edit session: a field
 * a single click has only selected is exactly the state a plain Tab would
 * otherwise leave with no visible effect. With nothing selected it does not
 * fire, so it never pre-empts the browser's native tab order through the
 * toolbar's buttons. When there is nowhere left to go it is `none`, so Tab
 * leaves the field the ordinary way. Off in fill mode: every fill input is a
 * real, focusable element already in reading order.
 *
 * Enter opens an edit session on a selected text box - the keyboard's
 * equivalent of double-clicking it.
 */
export function classifySignKey(ctx: SignKeyContext): SignKeyAction {
  if (ctx.key === 'Escape') {
    return ctx.editingElementId ? { kind: 'finish-editing' } : { kind: 'clear-selection' };
  }

  const isInput = ctx.activeTag === 'INPUT' || ctx.activeTag === 'TEXTAREA';

  if (!ctx.fillEnabled && ctx.key === 'Tab' && ctx.activeElementId) {
    const goingForward = !ctx.shiftKey;
    if (goingForward ? ctx.hasNext : ctx.hasPrevious) {
      return { kind: goingForward ? 'field-next' : 'field-previous' };
    }
  }

  if (ctx.key === 'Enter' && ctx.activeElementId && !ctx.editingElementId && !isInput) {
    return ctx.selectedIsText ? { kind: 'edit-selected' } : { kind: 'none' };
  }

  if (ctx.activeElementId && (ctx.key === 'Backspace' || ctx.key === 'Delete') && !isInput) {
    return { kind: 'delete-active' };
  }

  return { kind: 'none' };
}

/**
 * Fill mode (SNG-15): the pure decision behind "focus decides what is edited"
 * (docs/sign-fill-mode.md). Given the fill key focus is leaving and the one it
 * is entering, this returns the reducer actions that make selection and text
 * editing follow it. No DOM here; useFillFocus.ts is the only caller.
 *
 * A text element's fill key is textFillKey(id) ('el:<id>'); a slot's key
 * starts with 'slot:' or 'free:' and never reaches the reducer - a slot is
 * UI only until it is left with text in it (fillSlots.ts).
 */
import type { SignToolAction } from '../components/SignToolContext.tsx';
import { textFillKey } from './fillTypes.ts';

// Derived from textFillKey rather than the literal 'el:', so the one place
// that defines the format (fillTypes.ts) is the only place that can change it.
const TEXT_KEY_PREFIX = textFillKey('');

/** The element id a text fill key carries, or null for a slot key or null. */
function textElementId(key: string | null): string | null {
  return key !== null && key.startsWith(TEXT_KEY_PREFIX) ? key.slice(TEXT_KEY_PREFIX.length) : null;
}

/**
 * The reducer actions one focus move produces.
 *
 * `textOf` reads an element's current text, only ever for the element focus
 * is leaving, so a text box left empty is deleted rather than stranded in
 * the model. The reducer's own invariant (editingElementId is null or equals
 * activeElementId) is what decides the order within each half: leaving sets
 * editing null before active null (SET_ACTIVE_ELEMENT_ID would already clear
 * a stale editingElementId itself, but the edit session should read as
 * closed before the selection is dropped); entering sets active before
 * editing, since SET_EDITING_ELEMENT_ID is a no-op unless the id it is given
 * already matches activeElementId.
 */
export function focusActions(
  change: { from: string | null; to: string | null },
  textOf: (elementId: string) => string | undefined
): SignToolAction[] {
  const { from, to } = change;
  if (from === to) return [];

  const actions: SignToolAction[] = [];
  const leavingId = textElementId(from);
  const enteringId = textElementId(to);

  if (leavingId !== null) {
    actions.push({ type: 'SET_EDITING_ELEMENT_ID', payload: null });
    actions.push({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    if (!textOf(leavingId)?.trim()) {
      actions.push({ type: 'DELETE_ELEMENT', payload: leavingId });
    }
  }

  if (enteringId !== null) {
    actions.push({ type: 'SET_ACTIVE_ELEMENT_ID', payload: enteringId });
    actions.push({ type: 'SET_EDITING_ELEMENT_ID', payload: enteringId });
  }

  return actions;
}

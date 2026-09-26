/**
 * Fill mode's only DOM adapter (SNG-15): finding and focusing fill inputs. Reading
 * order is DOM order by construction (each page's fill layer renders in `fillOrder`),
 * so "next" is simply the next fill input in the document.
 */
import { FILL_INPUT_ATTR, FILL_KEY_ATTR } from './fillTypes.ts';
import type { PercentBox } from '../../../editor/text/combPlacement.ts';

const SELECTOR = `[${FILL_INPUT_ATTR}]`;

/**
 * A focus-move target carrying this attribute keeps the fill session open, same as moving into
 * a fill input itself (useFillFocus.ts). Used by chrome that focuses itself outside the normal
 * bar-button case, e.g. a phone font bottom sheet or a `<dialog>`.
 */
export const FILL_KEEP_SESSION_ATTR = 'data-fill-keep-session';

/**
 * Fill mode: a press on an element's own bar must not blur its fill input, since focus is the
 * edit session (useFillFocus). Text-entry controls inside the bar (font search, colour input)
 * still take focus.
 */
export function keepFillFocus(event: MouseEvent): void {
  if (!(event.target as Element | null)?.closest('input, select, textarea')) event.preventDefault();
}

/** Every fill input in document order. */
export function fillInputs(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
}

/** The fill key of the fill input containing `node`, or null. */
export function fillKeyOf(node: Element | null): string | null {
  return node?.closest(SELECTOR)?.getAttribute(FILL_KEY_ATTR) ?? null;
}

/** Focus the fill input with this key. Returns false when it is not in the document. */
export function focusFillInput(key: string, root: ParentNode = document): boolean {
  const target = fillInputs(root).find((el) => el.getAttribute(FILL_KEY_ATTR) === key);
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

/**
 * Move to the fill input after the one holding `fromKey`; on the last one, end typing.
 * Called from a key event, so iOS keeps its keyboard up across the move. The next field may be
 * off screen, so the platform is left to scroll it into view.
 */
export function focusNextFillInput(fromKey: string, root: ParentNode = document): void {
  const inputs = fillInputs(root);
  const index = inputs.findIndex((el) => el.getAttribute(FILL_KEY_ATTR) === fromKey);
  const next = index >= 0 ? inputs[index + 1] : undefined;
  if (next) next.focus();
  else (inputs[index] ?? (document.activeElement as HTMLElement | null))?.blur();
}

/** A detected tick box's reach key, stable across renders like a slot's. */
export function boxKey(region: PercentBox & { pageIndex: number }): string {
  return `box:${region.pageIndex}:${region.left.toFixed(2)}:${region.top.toFixed(2)}`;
}

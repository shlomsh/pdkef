import type { TextDirection } from '../../../editor/model/editorModel.ts';
import type { PercentBox } from '../../../editor/text/combPlacement.ts';
import { inReadingOrder } from '../../../editor/text/fieldOrder.ts';
import type { EnterKeyHint, FillItem } from './fillTypes.ts';

/**
 * Fill mode's own reading order (SNG-15, docs/sign-fill-mode.md): page, then
 * row, then the start edge, right to left on an RTL page - exactly the rule
 * `orderTypableFields` already applies to detected fields, reused here
 * through `inReadingOrder` so a form's slots and a form's fields never read
 * two different ways. `boxOf` is supplied by the caller because a `FillItem`
 * is either a slot (its box lives at `slot.placement.box`) or an already
 * placed text element (its box is its own geometry) - two shapes with
 * nothing in common for this module to reach into directly.
 */
export function fillOrder(
  items: FillItem[],
  boxOf: (item: FillItem) => PercentBox & { pageIndex: number },
  directionOfPage: (pageIndex: number) => TextDirection,
): FillItem[] {
  return inReadingOrder(items, boxOf, directionOfPage);
}

/**
 * The fill input's `enterkeyhint` (docs/sign-fill-mode.md): "next" on every
 * input but the last, so the keyboard's own return key reads as forward
 * progress; "done" on the last one, so it offers to close the keyboard
 * instead of promising a hop past the end of the form.
 */
export function enterKeyHint(index: number, count: number): EnterKeyHint {
  return index >= count - 1 ? 'done' : 'next';
}

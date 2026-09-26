/**
 * Fill mode (SNG-15): which writing spots on a page are still empty, and the
 * placement each one's slot takes.
 *
 * A slot never enters the editor model - `detectedSlots` only says which of
 * `fieldOrder.ts`'s already-ordered fields still has nothing on it, and the
 * two `placementFor*` builders describe where the slot's own `<input>` sits.
 * A detected field's slot uses exactly the geometry a text element placed
 * there would take (`placeTextOnField`), because a slot's whole promise
 * (docs/sign-fill-mode.md) is that filling it in produces that element with
 * no visible jump; `slotElement.ts` is the other half, the element a slot
 * with text in it becomes.
 */
import { fieldFontSize, placeTextOnField, type TypableField } from '../../../editor/text/combPlacement.ts';
import { elementIsOnField } from '../../../editor/text/fieldOrder.ts';
import type { TextElement } from '../../../editor/model/editorModel.ts';
import { TEXT_BOX_LINE_HEIGHT_EM } from '../../../constants/signGeometry.js';
import type { FillSlot, PagePoint, SlotPlacement } from './fillTypes.ts';

/** What a placement is built from: the document's carried size (SIGN-33, null
 * until the first placement seeds it) and family, and the page's size in points
 * for the page-percent math - exactly what `handlePageClick` places a tap with. */
interface SlotPageContext {
  carriedFontSize: number | null;
  fontFamily: string;
  pageWidthPoints: number;
  pageHeightPoints: number;
}

/**
 * Stable across renders because it is derived from the field's own printed
 * position, never an index into an order array - detection re-running, or
 * the same field shifting position in `order`, must not change which slot a
 * person was just looking at.
 */
export function slotKey(field: TypableField): string {
  const { pageIndex, left, top } = field.region;
  return `slot:${pageIndex}:${left.toFixed(2)}:${top.toFixed(2)}`;
}

/**
 * Where a slot on a detected field sits, using the very placement a text
 * element there would take (`placeTextOnField`) so the input and the element
 * it becomes never visibly disagree. A comb's span and a cell's `minWidth`
 * do the same job here - "how wide a person can tap and type" - so both
 * become the box's `width`; which one the resulting element actually needs
 * is decided later, from the field's own `kind` (`slotElement.ts`), never
 * guessed back from this already-merged box.
 */
export function placementForField(field: TypableField, page: SlotPageContext): SlotPlacement {
  const placed = placeTextOnField(field, page);
  const span = 'combCells' in placed ? placed.width : placed.minWidth;
  const area = field.region.writable ?? field.region;
  return {
    box: {
      left: placed.left,
      top: placed.top,
      width: span ?? field.region.width,
      height: area.height,
    },
    fontSize: placed.fontSize,
    fontFamily: page.fontFamily,
    ...('combCells' in placed ? { combCells: placed.combCells } : {}),
  };
}

/** A free slot's box is roughly this many PDF points wide: enough for a
 * short answer before it has to grow, without dwarfing a one-line field. */
const FREE_SLOT_WIDTH_POINTS = 160;

/**
 * How far a free slot's left edge sits before the tap that opened it, in PDF
 * points. A box starting exactly at the tap would put the very first
 * character directly under the fingertip that placed it; this small lead
 * keeps where typing begins in view as soon as the finger lifts.
 */
const FREE_SLOT_LEAD_POINTS = 10;

/**
 * Where a free slot sits: nothing was detected at the tap, so there is no
 * field to place on and no span to take, only a single line centred on the
 * point the way any freshly placed text box centres on its click point
 * (`textHeight` in `useWorkspaceGestures.ts`'s `handlePageClick`), sized
 * generously enough to read as a text field rather than a caret-thin sliver.
 * `at` is the only record of the tap once this returns, so a free slot's
 * eventual element is anchored to this box (`slotElement.ts`), not to the
 * tap point a second time.
 */
export function placementForFree(at: PagePoint, page: SlotPageContext): SlotPlacement {
  const widthPercent = page.pageWidthPoints > 0
    ? Math.min(100, (FREE_SLOT_WIDTH_POINTS / page.pageWidthPoints) * 100)
    : 0;
  const leadPercent = page.pageWidthPoints > 0 ? (FREE_SLOT_LEAD_POINTS / page.pageWidthPoints) * 100 : 0;
  const left = Math.max(0, Math.min(at.x - leadPercent, 100 - widthPercent));
  // A free tap's own size rule in handlePageClick: the carried size, or the default.
  const fontSize = fieldFontSize(page.carriedFontSize);
  const heightPercent = page.pageHeightPoints > 0
    ? (fontSize * TEXT_BOX_LINE_HEIGHT_EM / page.pageHeightPoints) * 100
    : 0;
  const top = Math.max(0, at.y - heightPercent / 2);
  return {
    box: { left, top, width: widthPercent, height: heightPercent },
    fontSize,
    fontFamily: page.fontFamily,
  };
}

/**
 * One slot per field in `order` that has no text element sitting on it yet
 * (`elementIsOnField`, the same test `useFieldNavigation.ts` resolves a
 * Next/Previous move onto), kept in the same reading order `fieldOrder.ts`
 * already produced - a page's fill layer needs no ordering logic of its own
 * beyond this list.
 */
export function detectedSlots(
  order: TypableField[],
  textElements: TextElement[],
  placementFor: (field: TypableField) => SlotPlacement,
): FillSlot[] {
  return order
    .filter((field) => !textElements.some((element) => elementIsOnField(element, field)))
    .map((field) => ({
      key: slotKey(field),
      pageIndex: field.region.pageIndex,
      field,
      placement: placementFor(field),
    }));
}

/**
 * Opens a slot where a tap landed on nothing detected. Keyed on the tap
 * point itself, rounded to a tenth of a percent - fine enough that two taps
 * a person could actually tell apart never collide, coarse enough that a
 * second tap on the spot they just meant reopens the same slot instead of
 * stacking a new one under it.
 */
export function freeSlot(at: PagePoint, placement: SlotPlacement): FillSlot {
  return {
    key: freeSlotKey(at),
    pageIndex: at.pageIndex,
    field: null,
    placement,
  };
}

/** A free slot's key, from the tap point alone, so it is known before the slot renders. */
export function freeSlotKey(at: PagePoint): string {
  return `free:${at.pageIndex}:${at.x.toFixed(1)}:${at.y.toFixed(1)}`;
}

/**
 * Fill mode (SNG-15): the TextElement a slot becomes once it holds text.
 *
 * A slot is UI only, so nothing about it is a real element until the person
 * leaves it non-empty. At that moment there must be exactly one way to build
 * the TextElement - the same one production already has for a tap on a field
 * (`useWorkspaceGestures.ts`'s `handlePageClick`) and for a Next/Previous
 * move onto one (`useFieldNavigation.ts`'s `goTo`): the registry's text
 * `create()`, then, for a detected field, `placeTextOnField` over the top of
 * it. Calling both fresh here - rather than trusting the slot's own already-
 * rendered `placement` - is what keeps a third call site from ever drifting
 * off the two production already has; `placeTextOnField`'s own docstring
 * makes the same point about its first two callers.
 */
import { getElementDefinition } from '../../../editor/registry/index.ts';
import { fieldFontSize, placeTextOnField } from '../../../editor/text/combPlacement.ts';
import { carriedTextStyle } from '../../../editor/model/elementDefaults.ts';
import type { DocumentStyle } from '../../../editor/model/documentStyle.ts';
import type { TextDirection, TextElement } from '../../../editor/model/editorModel.ts';
import { DEFAULT_FONT_FAMILY, DEFAULT_STROKE_WIDTH } from '../../../constants/signGeometry.js';
import type { FillSlot } from './fillTypes.ts';

/**
 * What a `FillSlot` does not itself carry, resolved by the caller so building
 * the element stays a pure function of its three arguments: the same inputs
 * `handlePageClick` places a tap with (SIGN-33's carried style).
 */
export interface SlotElementBase {
  /** The new element's id (`createElementId()`). */
  id: string;
  /** The colour a tap would place with (the carried colour, or the tool default). */
  color: string;
  /** The document's carried style. */
  carried: Partial<DocumentStyle>;
  /** The page's printed direction, for a field slot when the document carries none. */
  pageDirection: TextDirection | null;
  /** The page's size in PDF points, for a field slot's comb/cell fit. */
  pageWidthPoints: number;
  pageHeightPoints: number;
}

/**
 * The TextElement `slot` becomes once left with `text` in it: exactly what
 * `handlePageClick` places for a tap on the same spot. A field slot snaps
 * through `placeTextOnField` (a comb's `width` and `combCells`, a cell's
 * `minWidth`) and takes the carried direction, else the page's printed one.
 * A free slot keeps `create()`'s plain box at the slot's own resting spot,
 * so nothing jumps on commit. Both take the carried alignment, weight and
 * style (`carriedTextStyle`).
 */
export function elementForSlot(slot: FillSlot, text: string, base: SlotElementBase): TextElement {
  const create = getElementDefinition('text').creation.create;
  if (!create) throw new Error('the text element definition has no create()');

  const { carried } = base;
  const fontFamily = carried.font ?? DEFAULT_FONT_FAMILY;
  const carriedFontSize = carried.fontSize ?? null;
  const snapped = slot.field
    ? placeTextOnField(slot.field, {
      carriedFontSize,
      fontFamily,
      pageWidthPoints: base.pageWidthPoints,
      pageHeightPoints: base.pageHeightPoints,
    })
    : null;
  const point = slot.field
    ? { left: slot.field.region.left, top: slot.field.region.top }
    : { left: slot.placement.box.left, top: slot.placement.box.top };

  // whiteoutColor/strokeWidth are dead weight for a text element (text.ts's
  // create() never reads them), but CreateContext requires them.
  const placed = create({
    id: base.id,
    pageIndex: slot.pageIndex,
    point,
    color: base.color,
    whiteoutColor: '#ffffff',
    strokeWidth: DEFAULT_STROKE_WIDTH,
    font: fontFamily,
    fontSize: snapped ? snapped.fontSize : fieldFontSize(carriedFontSize),
    direction: carried.direction ?? null,
  });
  const element: TextElement = { ...placed, ...(snapped ?? {}), text, ...carriedTextStyle(carried) };
  if (slot.field) element.textDirection = carried.direction ?? base.pageDirection ?? 'ltr';
  return element;
}

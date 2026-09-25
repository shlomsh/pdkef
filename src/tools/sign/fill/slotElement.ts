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
import { placeTextOnField } from '../../../editor/text/combPlacement.ts';
import type { TextDirection, TextElement } from '../../../editor/model/editorModel.ts';
import { DEFAULT_STROKE_WIDTH } from '../../../constants/signGeometry.js';
import type { FillSlot } from './fillTypes.ts';

/**
 * The creation defaults a `FillSlot` does not itself carry - the same
 * remembered settings `handlePageClick`/`goTo` seed a fresh box with,
 * resolved once by the caller so building the element stays a pure function
 * of its three arguments rather than this module reaching into app state.
 */
export interface SlotElementBase {
  /** The new element's id (`createElementId()`). */
  id: string;
  color: string;
  fontFamily: string;
  fontSize: number;
  /**
   * Resolved by the caller exactly as `goTo`/`handlePageClick` resolve it
   * before ever reaching `create()`: a field slot takes the form's own
   * printed direction, a free slot the product's remembered one. Null lets
   * export auto-detect from the typed text, the same as any other free box.
   */
  direction: TextDirection | null;
  /** The page's size in PDF points. Only a field slot's comb/cell fit uses
   * them - see `placeTextOnField`; a free slot ignores both. */
  pageWidthPoints: number;
  pageHeightPoints: number;
}

/**
 * The TextElement `slot` becomes once left with `text` in it.
 *
 * A field slot places through `placeTextOnField` exactly as `goTo` and
 * `handlePageClick` do, so its span becomes `width` (with `combCells`) for a
 * comb or `minWidth` for a cell - the two are mutually exclusive, never both,
 * see that module's own docstring - decided here from the field's own
 * `kind`, never by re-deriving it from the slot's already-merged display
 * box. A free slot has no field to place on, so - exactly like
 * `handlePageClick`'s own unsnapped branch - nothing is layered over
 * `create()`'s plain, intrinsically sized box; its position is the slot's
 * own resting box, the only place a free slot's geometry survives once the
 * tap that opened it is gone, so the element lands exactly where the slot
 * the person was just looking at sat, with no jump on commit.
 */
export function elementForSlot(slot: FillSlot, text: string, base: SlotElementBase): TextElement {
  const create = getElementDefinition('text').creation.create;
  if (!create) throw new Error('the text element definition has no create()');

  // whiteoutColor/strokeWidth are dead weight for a text element (text.ts's
  // create() never reads them) but CreateContext still requires them, the
  // same way goTo hardcodes them rather than threading them through options
  // nobody placing text ever needs.
  const context = {
    id: base.id,
    pageIndex: slot.pageIndex,
    color: base.color,
    whiteoutColor: '#ffffff',
    strokeWidth: DEFAULT_STROKE_WIDTH,
    font: base.fontFamily,
    fontSize: base.fontSize,
    direction: base.direction,
  };

  if (slot.field) {
    const placed = create({ ...context, point: { left: slot.field.region.left, top: slot.field.region.top } });
    const snapped = placeTextOnField(slot.field, {
      fontSize: base.fontSize,
      fontFamily: base.fontFamily,
      pageWidthPoints: base.pageWidthPoints,
      pageHeightPoints: base.pageHeightPoints,
    });
    return { ...placed, ...snapped, text };
  }

  const placed = create({ ...context, point: { left: slot.placement.box.left, top: slot.placement.box.top } });
  return { ...placed, text };
}

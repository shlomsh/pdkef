import type { TextDirection } from '../model/editorModel.ts';
import type { CombRegion, FieldRegion, PercentBox, TypableField } from './combPlacement.ts';

export type { TypableField };

/**
 * The order a person fills a form's detected fields in, so the editor can
 * offer "next field" instead of making them find every box by hand.
 *
 * MOBI-03/11 find the fields; MOBI-04/11 make one field a single tap. What is
 * left on a phone is travel: with the keyboard covering half the screen, the
 * field being typed into and the one after it are rarely both visible, and
 * form 101 has 38 comb runs on page 1 alone. Given an order, a whole page is
 * "tap the first field, type, Next, type, Next".
 *
 * Only the fields a text box can go in take part - comb runs and free-text
 * cells. A checkbox is a different tool and a different gesture (a toggle,
 * not typing), and a signature cell is a dialog; neither belongs in a
 * type-Next-type sequence.
 *
 * **Reading order is the document's, not the UI's.** Both evidence forms are
 * Hebrew: a naive left-to-right, top-to-bottom walk visits every row
 * backwards. Rows run top to bottom on any form, but *within* a row the first
 * field is the rightmost one on a right-to-left page and the leftmost on a
 * left-to-right one. Which the page is comes from the page's own printed
 * text (`dominantTextDirection` over the text runs pdf.js reports - see
 * `useFormFieldRegions`), never from the site locale: a Hebrew form opened on
 * the English edition still reads right to left, and an English e-ticket on
 * the Hebrew edition still reads left to right.
 */

/**
 * How far below a row's lowest ink a field's vertical centre may still fall
 * and share the row, in page percent (~2.5pt on A4). Fields on one printed
 * line overlap vertically: a comb's teeth hang from the writing line inside
 * the band a closed cell on the same line spans, so a centre-inside-the-row
 * test puts them together with no tolerance at all; this is slack for the
 * detector's own edge rounding. The next line of a form is never closer than
 * a line of text (~1.4%), so it stays a row of its own.
 */
const ROW_TOLERANCE_PERCENT = 0.3;

function centreYOfBox(box: PercentBox): number {
  return box.top + box.height / 2;
}

function startEdgeOfBox(box: PercentBox, direction: TextDirection): number {
  return direction === 'rtl'
    ? -(box.left + box.width)
    : box.left;
}

function centreY(field: TypableField): number {
  return centreYOfBox(field.region);
}

/**
 * Page, then row, then the start edge, right to left on an RTL page: the
 * reading-order core both `orderTypableFields` (detected fields) and fill
 * mode's `fillOrder` (SNG-15, `src/tools/sign/fill/fillOrder.ts`) sort by, so
 * a form's slots and its fields can never silently read two different ways.
 * `boxOf` is what makes it generic - a `TypableField` keeps its box at
 * `.region`, a fill item keeps its somewhere else entirely, and this core has
 * no business knowing which.
 *
 * Row clustering is a single pass over the items sorted by top edge: an item
 * joins the row being built while its vertical centre lies inside the band
 * the row's members cover so far (plus `ROW_TOLERANCE_PERCENT`), so a comb
 * and a taller cell on the same printed line land together and the next
 * printed line, whose items start below the band, opens a new row.
 */
export function inReadingOrder<T>(
  items: T[],
  boxOf: (item: T) => PercentBox & { pageIndex: number },
  directionOfPage: (pageIndex: number) => TextDirection,
): T[] {
  const pages = new Map<number, T[]>();
  for (const item of items) {
    const pageIndex = boxOf(item).pageIndex;
    const list = pages.get(pageIndex) ?? [];
    list.push(item);
    pages.set(pageIndex, list);
  }
  const ordered: T[] = [];
  for (const pageIndex of [...pages.keys()].sort((a, b) => a - b)) {
    const direction = directionOfPage(pageIndex);
    const byTop = [...pages.get(pageIndex)!].sort((a, b) => boxOf(a).top - boxOf(b).top);
    let row: T[] = [];
    let rowBottom = Number.NEGATIVE_INFINITY;
    const flush = () => {
      row.sort((a, b) => startEdgeOfBox(boxOf(a), direction) - startEdgeOfBox(boxOf(b), direction));
      ordered.push(...row);
      row = [];
    };
    for (const item of byTop) {
      const box = boxOf(item);
      if (row.length > 0 && centreYOfBox(box) > rowBottom + ROW_TOLERANCE_PERCENT) flush();
      row.push(item);
      rowBottom = Math.max(rowBottom, box.top + box.height);
    }
    flush();
  }
  return ordered;
}

/**
 * Every typable field on the document in fill order: page by page, rows top
 * to bottom, and within a row in the page's own reading direction. A thin
 * wrapper over `inReadingOrder` - a comb or cell region already is the box a
 * field sorts by (`field.region`), so there is nothing left for this to do
 * but tag the two detectors' output into one list first.
 */
export function orderTypableFields(
  combs: CombRegion[],
  cells: FieldRegion[],
  directionOfPage: (pageIndex: number) => TextDirection,
): TypableField[] {
  const fields: TypableField[] = [
    ...combs.map((region) => ({ kind: 'comb' as const, region })),
    ...cells.map((region) => ({ kind: 'cell' as const, region })),
  ];
  return inReadingOrder(fields, (field) => field.region, directionOfPage);
}

/**
 * The element a placed text box has to be to count as "on" a field, in page
 * percent. Both placement paths (`placeCombOnRegion`, `placeTextOnCell`)
 * always leave the box's LEFT edge on the field's own left edge - a comb
 * takes the run's span, a cell takes its span as `minWidth`, and combPlacement.ts's
 * own docstring is explicit that neither kind has "a growing edge to anchor"
 * any more, regardless of RTL/LTR - so horizontally this is a tight match
 * against one edge only. Matching the field's *right* edge too would double
 * as a false hit on whichever field sits immediately to its left: cells in
 * the same row commonly butt up edge to edge, so one field's right edge is
 * often another one's left edge, and a naive first-match would then silently
 * report a box as sitting on its own left neighbour instead - see `closest`.
 *
 * Vertically, `ON_FIELD_ABOVE` gives every kind of field the same slack, even
 * though only an open comb's own docstring reasoning (baseline measured up
 * from the region's bottom edge) predicts it: a closed cell or a boxed comb
 * centres instead, which *usually* keeps it within `[top, top + height]`, but
 * not always - `placeCombOnRegion`'s boxed branch centres the *baseline*, not
 * the box, and a font whose baseline sits well below its em-box centre (the
 * common case) still pulls a placed box's top above `region.top` by a real,
 * per-font-and-size amount. There is no fixed constant that is exactly right
 * for every family and fit; being generous here and resolving the resulting
 * overlap by closeness (below) is far more robust than trying to derive that
 * amount from a field alone, which has no idea what font it was placed with.
 */
const ON_FIELD_X_TOLERANCE = 0.6;
const ON_FIELD_ABOVE = 2.5;

export interface PlacedText {
  id: string;
  type: string;
  pageIndex: number;
  left: number;
  top: number;
}

/** True when `element` is a text box sitting on `field`. */
export function elementIsOnField(element: PlacedText, field: TypableField): boolean {
  if (element.type !== 'text' || element.pageIndex !== field.region.pageIndex) return false;
  const { region } = field;
  const onLeft = Math.abs(element.left - region.left) <= ON_FIELD_X_TOLERANCE;
  // A comb's `writable` is the printed cell around its teeth, and a box on it
  // is centred in that cell (placeCombOnRegion), well above the teeth.
  const top = Math.min(region.top, region.writable?.top ?? region.top);
  const bottom = Math.max(region.top + region.height, region.writable ? region.writable.top + region.writable.height : 0);
  const inBand = element.top >= top - ON_FIELD_ABOVE && element.top <= bottom;
  return onLeft && inBand;
}

/**
 * The single closest of several equally-valid matches, by vertical distance.
 *
 * Two boxed fields that tile with no gap share one edge - a top-to-bottom
 * column is the common case, but a two-column form like this one shares an
 * edge in BOTH directions at once (`combined-heuristic-0000`'s right edge is
 * `-0001`'s left, and `-0000`'s bottom is `-0004`'s top; the live-QA fixture,
 * health-declaration-page1-geometry.pdf, has both). A box placed exactly on
 * that shared point satisfies both fields' bands at once, by construction -
 * no tolerance tweak removes the ambiguity, only which field wins it. The
 * field whose own top is closer to the point is the one it was actually
 * placed on: a box centred in field F (every current placement path centres
 * or nearly centres, per `ON_FIELD_ABOVE`'s doc) lands close to F.top and far
 * from any neighbour's.
 */
function closest<T>(candidates: T[], distance: (candidate: T) => number): T {
  return candidates.reduce((nearest, candidate) => (
    distance(candidate) < distance(nearest) ? candidate : nearest
  ));
}

/**
 * The index of the field `element` truly belongs to among every field in
 * `order`, or null if it belongs to none - the single source both
 * `fieldPosition` and `elementOnField` resolve an element's field from, so
 * the two can never disagree about which one it is.
 */
function fieldIndexOf(order: TypableField[], element: PlacedText): number | null {
  const matches = order
    .map((_field, i) => i)
    .filter((i) => elementIsOnField(element, order[i]));
  return matches.length > 0
    ? closest(matches, (i) => Math.abs(order[i].region.top - element.top))
    : null;
}

/**
 * The text element sitting on `field`, if any.
 *
 * Resolved against the WHOLE order (`fieldIndexOf`), not `field` in
 * isolation: `ON_FIELD_ABOVE`'s generous, kind-agnostic slack means an
 * existing box can technically satisfy a neighbouring field's band too, and
 * checking `field` alone had no way to tell "this box is on some other field,
 * merely close enough to graze this one's tolerance" from "this box really is
 * on this field" - so a box one field away could be mistaken for "already
 * placed here" and reopened instead of a new one being created where Next
 * actually meant to go (live QA, MOBI-06: Next from the last cell in a row
 * re-selected the first cell's own box instead of creating one on the row
 * below). Going through `fieldIndexOf` first settles which field an element
 * *actually* belongs to using every field as context, the same resolution
 * `fieldPosition` already needs for its own `index`, before asking whether
 * that happens to be this one.
 */
export function elementOnField<T extends PlacedText>(elements: T[], order: TypableField[], field: TypableField): T | null {
  const targetIndex = order.indexOf(field);
  const candidates = elements.filter((element) => fieldIndexOf(order, element) === targetIndex);
  return candidates.length > 0
    ? closest(candidates, (element) => Math.abs(element.top - field.region.top))
    : null;
}

/**
 * Where an element stands in the fill order.
 *
 * `index` is the field the element sits on, or null when it sits on none.
 * `next`/`previous` are the fields Next and Previous should go to from here:
 * for an element on a field, its neighbours; for one that is not (a box
 * placed by hand between two rows, a signature), the first field that comes
 * after it in reading order and the last that comes before, so Next from a
 * free-placed box still walks forward down the page rather than jumping to
 * field 1. With no element at all, Next starts at the first field and
 * Previous at the last.
 */
export function fieldPosition(
  order: TypableField[],
  element: PlacedText | null,
): { index: number | null; next: number | null; previous: number | null } {
  const last = order.length - 1;
  if (order.length === 0) return { index: null, next: null, previous: null };
  if (!element) return { index: null, next: 0, previous: last };
  const index = fieldIndexOf(order, element) ?? -1;
  if (index >= 0) {
    return {
      index,
      next: index < last ? index + 1 : null,
      previous: index > 0 ? index - 1 : null,
    };
  }
  // Reading position of a box that is on no field: after every field whose
  // row is above it (or on its row and before it, which for this purpose
  // "top" alone decides well enough - a hand-placed box is rarely on a row of
  // fields at all).
  const after = order.filter((field) => field.region.pageIndex < element.pageIndex
    || (field.region.pageIndex === element.pageIndex && centreY(field) < element.top)).length;
  return {
    index: null,
    next: after <= last ? after : null,
    previous: after > 0 ? after - 1 : null,
  };
}

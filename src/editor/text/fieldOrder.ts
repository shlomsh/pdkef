import type { TextDirection } from '../model/editorModel.ts';
import type { CombRegion, FieldRegion, PercentBox, TypableField } from './combPlacement.ts';

export type { TypableField };

/**
 * The order a person fills a form's detected fields in, for "next field" on a
 * phone, where the keyboard hides most of the page. Only fields a text box can
 * go in take part (comb runs and free-text cells); a checkbox is a toggle and
 * a signature cell is a dialog.
 *
 * Reading order is the document's, not the UI's: rows run top to bottom, and
 * within a row the first field is the rightmost on a right-to-left page. The
 * direction comes from the page's own printed text (`dominantTextDirection`,
 * see `useFormFieldRegions`), never from the site locale.
 */

/**
 * How far below a row's lowest ink a field's centre may fall and still share
 * the row, in page percent (~2.5pt on A4): slack for the detector's edge
 * rounding. The next printed line is never closer than a line of text (~1.4%).
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
 * Page, then row, then the start edge (right to left on an RTL page). Fill
 * mode's `fillOrder` (SNG-15) sorts through this too, so a form's slots and
 * its fields can never read two ways. `boxOf` keeps it ignorant of where an
 * item keeps its box.
 *
 * Rows are clustered in one pass by top edge: an item joins the current row
 * while its centre lies inside the band the row covers so far, so a comb and a
 * taller cell on one printed line land together.
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

/** Every typable field in fill order: page, then row, then the page's reading direction. */
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
 * What a placed text box has to be to count as "on" a field, in page percent.
 *
 * Both placement paths leave the box's LEFT edge on the field's left edge, so
 * horizontally this matches that one edge. Matching the right edge too would
 * hit the neighbour on the left, since cells in a row butt up edge to edge.
 *
 * Vertically every kind of field gets the same generous slack. A boxed comb
 * centres the *baseline*, and a font whose baseline sits well below its em-box
 * centre pulls the box's top above `region.top` by an amount that depends on
 * font and size, which a field cannot know. The overlap this allows is
 * resolved by closeness (`closest`).
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
  // A box on a comb's `writable` cell is centred in it, well above the teeth.
  const top = Math.min(region.top, region.writable?.top ?? region.top);
  const bottom = Math.max(region.top + region.height, region.writable ? region.writable.top + region.writable.height : 0);
  const inBand = element.top >= top - ON_FIELD_ABOVE && element.top <= bottom;
  return onLeft && inBand;
}

/**
 * The closest of several equally valid matches, by vertical distance. Boxed
 * fields that tile share an edge (a two-column form in both directions), so a
 * box placed on it satisfies both bands and no tolerance removes that. A placed
 * box lands near the top of the field it was centred in, not a neighbour's.
 */
function closest<T>(candidates: T[], distance: (candidate: T) => number): T {
  return candidates.reduce((nearest, candidate) => (
    distance(candidate) < distance(nearest) ? candidate : nearest
  ));
}

/** The field `element` belongs to, or null; the one resolution `fieldPosition` and `elementOnField` share. */
function fieldIndexOf(order: TypableField[], element: PlacedText): number | null {
  const matches = order
    .map((_field, i) => i)
    .filter((i) => elementIsOnField(element, order[i]));
  return matches.length > 0
    ? closest(matches, (i) => Math.abs(order[i].region.top - element.top))
    : null;
}

/**
 * The text element sitting on `field`, if any. Resolved against the whole
 * order: `ON_FIELD_ABOVE`'s slack lets a box on one field graze its
 * neighbour's band, and checking `field` alone would reopen that box instead
 * of creating a new one where Next meant to go.
 */
export function elementOnField<T extends PlacedText>(elements: T[], order: TypableField[], field: TypableField): T | null {
  const targetIndex = order.indexOf(field);
  const candidates = elements.filter((element) => fieldIndexOf(order, element) === targetIndex);
  return candidates.length > 0
    ? closest(candidates, (element) => Math.abs(element.top - field.region.top))
    : null;
}

/**
 * Where an element stands in the fill order. `index` is the field it sits on,
 * or null. `next`/`previous` are its neighbours; for an element on no field
 * (a hand-placed box, a signature) they are the first field after it and the
 * last before it, so Next still walks forward down the page. With no element,
 * Next starts at the first field and Previous at the last.
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
  // On no field: after every field whose centre is above it.
  const after = order.filter((field) => field.region.pageIndex < element.pageIndex
    || (field.region.pageIndex === element.pageIndex && centreY(field) < element.top)).length;
  return {
    index: null,
    next: after <= last ? after : null,
    previous: after > 0 ? after - 1 : null,
  };
}

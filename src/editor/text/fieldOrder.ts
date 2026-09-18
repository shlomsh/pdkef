import type { TextDirection } from '../model/editorModel.ts';
import type { CombRegion, FieldRegion, TypableField } from './combPlacement.ts';

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

function centreY(field: TypableField): number {
  return field.region.top + field.region.height / 2;
}

function startEdge(field: TypableField, direction: TextDirection): number {
  return direction === 'rtl'
    ? -(field.region.left + field.region.width)
    : field.region.left;
}

/**
 * Every typable field on the document in fill order: page by page, rows top
 * to bottom, and within a row in the page's own reading direction.
 *
 * Row clustering is a single pass over the fields sorted by top edge: a
 * field joins the row being built while its vertical centre lies inside the
 * band the row's members cover so far (plus `ROW_TOLERANCE_PERCENT`), so a
 * comb and a taller cell on the same printed line land together and the next
 * printed line, whose fields start below the band, opens a new row.
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
  const pages = new Map<number, TypableField[]>();
  for (const field of fields) {
    const list = pages.get(field.region.pageIndex) ?? [];
    list.push(field);
    pages.set(field.region.pageIndex, list);
  }
  const ordered: TypableField[] = [];
  for (const pageIndex of [...pages.keys()].sort((a, b) => a - b)) {
    const direction = directionOfPage(pageIndex);
    const byTop = [...pages.get(pageIndex)!].sort((a, b) => a.region.top - b.region.top);
    let row: TypableField[] = [];
    let rowBottom = Number.NEGATIVE_INFINITY;
    const flush = () => {
      row.sort((a, b) => startEdge(a, direction) - startEdge(b, direction));
      ordered.push(...row);
      row = [];
    };
    for (const field of byTop) {
      if (row.length > 0 && centreY(field) > rowBottom + ROW_TOLERANCE_PERCENT) flush();
      row.push(field);
      rowBottom = Math.max(rowBottom, field.region.top + field.region.height);
    }
    flush();
  }
  return ordered;
}

/**
 * The element a placed text box has to be to count as "on" a field, in page
 * percent. Both placement paths leave the box's anchored edge on the field's
 * own edge (`placeCombOnRegion`, `cellAnchorPoint`), so horizontally this is
 * a tight match; vertically the box's top is lifted above an open comb's rule
 * by its baseline drop (about an em, ~1.5% of a page at 12pt), so the band
 * reaches that far above the field and to its bottom edge.
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
  const { left, top, width, height } = field.region;
  const onLeft = Math.abs(element.left - left) <= ON_FIELD_X_TOLERANCE;
  const onRight = Math.abs(element.left - (left + width)) <= ON_FIELD_X_TOLERANCE;
  const inBand = element.top >= top - ON_FIELD_ABOVE && element.top <= top + height;
  return (onLeft || onRight) && inBand;
}

/** The first text element sitting on `field`, if any. */
export function elementOnField<T extends PlacedText>(elements: T[], field: TypableField): T | null {
  return elements.find((element) => elementIsOnField(element, field)) ?? null;
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
  const index = order.findIndex((field) => elementIsOnField(element, field));
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

// SIGN-43: turning a page a quarter turn clockwise in Sign, as pure functions.
// A turn is document state ("page 3 is turned once"), applied on top of the
// page's own /Rotate. Elements are stored in percent of the displayed page, so
// a turn moves every element on that page with the content under it.
import type { PageGeometry } from './coords.ts';
import type { EditorElement } from '../model/editorModel.ts';

/** Clockwise quarter turns a person added to each page, by page index. A page with none is absent. */
export type PageTurns = Readonly<Record<number, 1 | 2 | 3>>;

type PercentPoint = { x: number; y: number };
type PercentBox = { left: number; top: number; width: number; height: number };

/** Quarter turns on a page, 0 when it has none. */
export function turnsOf(turns: PageTurns, pageIndex: number): 0 | 1 | 2 | 3 {
  throw new Error('SIGN-43: not implemented');
}

/** The turns after one more clockwise quarter turn of a page (by = -1 undoes one). Four turns drop the entry. */
export function addTurn(turns: PageTurns, pageIndex: number, by: 1 | -1 = 1): PageTurns {
  throw new Error('SIGN-43: not implemented');
}

/** The page's geometry after `quarterTurns` more clockwise quarter turns: same CropBox and UserUnit, rotation advanced. */
export function turnGeometry(geometry: PageGeometry, quarterTurns: number): PageGeometry {
  throw new Error('SIGN-43: not implemented');
}

/** A page-percent point after the page turns clockwise: one quarter maps (x, y) to (100 - y, x). */
export function turnPercentPoint(point: PercentPoint, quarterTurns: number): PercentPoint {
  throw new Error('SIGN-43: not implemented');
}

/** A page-percent box whose corners follow the content as the page turns (width and height swap on odd turns). */
export function turnPercentBox(box: PercentBox, quarterTurns: number): PercentBox {
  throw new Error('SIGN-43: not implemented');
}

/**
 * An element after its page turns `quarterTurns` from `from`. Elements that cover
 * content (rectangle, ellipse, whiteout, line) turn with it. Marks written on the
 * page (text, signature, symbol and the rest) stay upright and keep their size in
 * points; their anchor follows the content.
 */
export function turnElement<T extends EditorElement>(element: T, from: PageGeometry, quarterTurns: number): T {
  throw new Error('SIGN-43: not implemented');
}

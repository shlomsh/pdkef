// SIGN-43: turning a page a quarter turn clockwise in Sign, as pure functions.
// A turn is document state ("page 3 is turned once"), applied on top of the
// page's own /Rotate. Elements are stored in percent of the displayed page, so
// a turn moves every element on that page with the content under it.
import { createPageGeometry, type PageGeometry } from './coords.ts';
import type { EditorElement } from '../model/editorModel.ts';

/** Clockwise quarter turns a person added to each page, by page index. A page with none is absent. */
export type PageTurns = Readonly<Record<number, 1 | 2 | 3>>;

type PercentPoint = { x: number; y: number };
type PercentBox = { left: number; top: number; width: number; height: number };

const mod4 = (n: number): number => ((n % 4) + 4) % 4;

/** Kinds that cover page content and so turn with it; any other kind stays upright. */
const TURNS_WITH_PAGE = new Set<string>(['rectangle', 'ellipse', 'whiteout', 'line']);

/** Quarter turns on a page, 0 when it has none. */
export function turnsOf(turns: PageTurns, pageIndex: number): 0 | 1 | 2 | 3 {
  return (turns[pageIndex] ?? 0) as 0 | 1 | 2 | 3;
}

/** The turns after one more clockwise quarter turn of a page (by = -1 undoes one). Four turns drop the entry. */
export function addTurn(turns: PageTurns, pageIndex: number, by: 1 | -1 = 1): PageTurns {
  const next = mod4(turnsOf(turns, pageIndex) + by);
  const { [pageIndex]: _dropped, ...rest } = turns;
  return next === 0 ? rest : { ...rest, [pageIndex]: next as 1 | 2 | 3 };
}

/** The page's geometry after `quarterTurns` more clockwise quarter turns: same CropBox and UserUnit, rotation advanced. */
export function turnGeometry(geometry: PageGeometry, quarterTurns: number): PageGeometry {
  return createPageGeometry({
    cropBox: geometry.cropBox,
    rotation: (geometry.rotation + 90 * mod4(quarterTurns)) % 360,
    userUnit: geometry.userUnit,
  });
}

/** A page-percent point after the page turns clockwise: one quarter maps (x, y) to (100 - y, x). */
export function turnPercentPoint(point: PercentPoint, quarterTurns: number): PercentPoint {
  let { x, y } = point;
  for (let i = mod4(quarterTurns); i > 0; i--) [x, y] = [100 - y, x];
  return { x, y };
}

/** A page-percent box whose corners follow the content as the page turns (width and height swap on odd turns). */
export function turnPercentBox(box: PercentBox, quarterTurns: number): PercentBox {
  const a = turnPercentPoint({ x: box.left, y: box.top }, quarterTurns);
  const b = turnPercentPoint({ x: box.left + box.width, y: box.top + box.height }, quarterTurns);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/**
 * An element after its page turns `quarterTurns` from `from`. Elements that cover
 * content (rectangle, ellipse, whiteout, line) turn with it. Marks written on the
 * page (text, signature, symbol and the rest) stay upright and keep their size in
 * points; their anchor follows the content.
 */
export function turnElement<T extends EditorElement>(element: T, from: PageGeometry, quarterTurns: number): T {
  const q = mod4(quarterTurns);
  if (element.type === 'line') {
    const a = turnPercentPoint({ x: element.x1, y: element.y1 }, q);
    const b = turnPercentPoint({ x: element.x2, y: element.y2 }, q);
    return { ...element, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  if (!('left' in element)) return element;
  if (TURNS_WITH_PAGE.has(element.type)) {
    return { ...element, ...turnPercentBox(element as unknown as PercentBox, q) };
  }
  const to = turnGeometry(from, q);
  const { left, top, width, height } = element as { left: number; top: number; width?: unknown; height?: unknown };
  // A width in percent keeps its size in points on the turned page.
  const widthAfter = typeof width === 'number' ? (width * from.width) / to.width : undefined;
  if (typeof width !== 'number' || typeof height !== 'number') {
    // A point-anchored mark (text, a comb): the anchor follows the content.
    const p = turnPercentPoint({ x: left, y: top }, q);
    return { ...element, left: p.x, top: p.y, ...(widthAfter === undefined ? {} : { width: widthAfter }) };
  }
  // Upright box: same size in points, centered where the content under its center went.
  const heightAfter = (height * from.height) / to.height;
  const c = turnPercentPoint({ x: left + width / 2, y: top + height / 2 }, q);
  return { ...element, left: c.x - widthAfter! / 2, top: c.y - heightAfter / 2, width: widthAfter, height: heightAfter };
}

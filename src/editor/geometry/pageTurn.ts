// SIGN-43: turning a page a quarter turn clockwise in Sign, as pure functions.
// A turn is document state ("page 3 is turned once"), applied on top of the
// page's own /Rotate. Elements are stored in percent of the displayed page, so
// a turn moves every element on that page with the content under it.
import { createPageGeometry, type PageGeometry } from './coords.ts';
import type { EditorElement } from '../model/editorModel.ts';
import { DEFAULT_LINE_HEIGHT_EM } from '../model/signGeometry.js';

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

/** A page-percent point after the page turns clockwise: one quarter maps (x, y) to (100 - y, x). @testSeam */
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
 * content (rectangle, ellipse, whiteout, line, highlight) turn with it. Marks written on the
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
  if (element.type === 'highlight') {
    const turned = turnPercentBox(element, q);
    // Bands are percents of the element's box: turn each in page percent, then re-express it in the turned box.
    const bands = element.bands.map((band) => {
      const b = turnPercentBox({
        left: element.left + (band.left / 100) * element.width,
        top: element.top + (band.top / 100) * element.height,
        width: (band.width / 100) * element.width,
        height: (band.height / 100) * element.height,
      }, q);
      return {
        left: ((b.left - turned.left) / turned.width) * 100,
        top: ((b.top - turned.top) / turned.height) * 100,
        width: (b.width / turned.width) * 100,
        height: (b.height / turned.height) * 100,
      };
    });
    return { ...element, ...turned, bands };
  }
  if (TURNS_WITH_PAGE.has(element.type)) {
    return { ...element, ...turnPercentBox(element as unknown as PercentBox, q) };
  }
  const to = turnGeometry(from, q);
  const { left, top, width, height, minWidth, fontSize } = element as {
    left: number; top: number; width?: unknown; height?: unknown; minWidth?: unknown; fontSize?: unknown;
  };
  // A width in percent keeps its size in points on the turned page.
  const rescale = (v: unknown): number | undefined => (typeof v === 'number' ? (v * from.width) / to.width : undefined);
  const widthAfter = rescale(width);
  if (typeof width !== 'number' || typeof height !== 'number') {
    // A point-anchored mark (text, a comb): the anchor is the top-left of its one-line box, which follows the content.
    const lineHeight = typeof fontSize === 'number' ? ((fontSize * DEFAULT_LINE_HEIGHT_EM) / from.height) * 100 : 0;
    const turned = turnPercentBox({ left, top, width: 0, height: lineHeight }, q);
    const minWidthAfter = rescale(minWidth);
    const known = widthAfter ?? minWidthAfter;
    // A known width must not hang off the turned page.
    const x = known === undefined ? turned.left : Math.max(0, Math.min(turned.left, 100 - known));
    return {
      ...element, left: x, top: turned.top,
      ...(widthAfter === undefined ? {} : { width: widthAfter }),
      ...(minWidthAfter === undefined ? {} : { minWidth: minWidthAfter }),
    };
  }
  // Upright box: same size in points, centered where the content under its center went.
  const heightAfter = (height * from.height) / to.height;
  const c = turnPercentPoint({ x: left + width / 2, y: top + height / 2 }, q);
  return { ...element, left: c.x - widthAfter! / 2, top: c.y - heightAfter / 2, width: widthAfter, height: heightAfter };
}

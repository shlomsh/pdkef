import { toPagePercentBox } from '../../geometry/coords.ts';

/**
 * pdf.js text items as `formCells.js`'s page-percent `PageTextRun` shape.
 *
 * `formCells.js` reads these for two things: label lookup, and its "this cell
 * is explanatory prose, drop it" filter. Both are why a form scores the way it
 * does, so who performs this conversion is not an implementation detail - it
 * decides whether a measurement describes the product or a subset of it.
 *
 * It lives here because there are two callers with the same need and different
 * ways of opening a document: `useFormFieldRegions.ts` has a `PDFPageProxy`
 * from the viewer, and the scored corpus opens the file itself in Node. Only
 * the opening differs; the conversion is the same arithmetic, and a second
 * copy of it would be a second set of numbers waiting to disagree.
 *
 * `TextMarkedContent` entries carry no `str`/`transform` of their own - they
 * are marked-content operators, not glyph runs - and are skipped like a blank.
 *
 * @param {Array<object>} items `getTextContent().items`
 * @param {import('../../geometry/coords.ts').PageGeometry} geometry
 * @returns {Array<{str: string, left: number, top: number, width: number, height: number}>}
 */
export function toPageTextRuns(items, geometry) {
  return items.flatMap((item) => {
    if (!item || typeof item.str !== 'string' || !item.str.trim()) return [];
    const [, , , , e, f] = item.transform;
    return [{ str: item.str, ...toPagePercentBox(geometry, { x0: e, y0: f, x1: e + item.width, y1: f + item.height }) }];
  });
}

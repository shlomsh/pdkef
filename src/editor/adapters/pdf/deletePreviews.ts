/**
 * RED-16: the words Delete shows for a text object ("Click to delete: ...",
 * the preview a delete mark keeps, the term the saved-file check looks for).
 * `pdfObjects.js` finds a text object and the box it fills; this says what
 * that box holds, from the glyph read pdf.js gives (`readPageGlyphs`), so
 * there is one reader of a PDF's text and Hebrew comes out in reading order
 * however the file stores it. A glyph belongs to an object when its centre
 * lies inside the object's box, and the glyphs are put in reading order by
 * `textInReadingOrder`, the rule the saved-file check already uses. An object
 * with no glyph inside gets no preview, never a guess. Pure.
 */

import type { PageGeometry } from '../../geometry/coords.ts';
import type { PageGlyph } from './pageGlyphs.ts';
import { textInReadingOrder } from './textLayer.ts';

/** Where a glyph's centre sits above its baseline, in ems: the middle of the
 * x-height band, inside any text object's ascent-to-descent box. */
const CENTRE_EM = 0.3;
/** How far past a box a glyph may sit and still be the end of that box's run,
 * as a share of the box's longer side plus its shorter side (about a letter's
 * height). Needed because the parser sizes a run from the font's `/Widths`,
 * or half an em a glyph where the font has none (a standard font, unembedded),
 * so a long run's box can end a few letters short of what is drawn. */
const RUN_END_SHARE = 0.3;

/** What `previewTexts` reads of a deletable object: `bbox` is the object's
 * box in PDF user space, the same space as the glyphs. */
export interface PreviewObject {
  id: string;
  kind: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const distanceTo = (box: Box, x: number, y: number) =>
  Math.hypot(Math.max(box.x - x, 0, x - (box.x + box.width)), Math.max(box.y - y, 0, y - (box.y + box.height)));

/**
 * The preview of each text object of one page, by object id. Objects that
 * are not text, or hold no glyph, are absent from the map.
 *
 * A glyph belongs to every text object whose box holds its centre. A glyph
 * no box holds is the end of a run whose box came out short (see
 * `RUN_END_SHARE`) and goes to the nearest box within that reach, never to
 * more than one.
 */
export function previewTexts(
  objects: readonly PreviewObject[],
  glyphs: readonly PageGlyph[],
  geometry: PageGeometry,
): Map<string, string> {
  const previews = new Map<string, string>();
  const boxes: Box[] = [];
  for (const object of objects) {
    if ((object.kind === 'text' || object.kind === 'mark') && object.bbox) boxes.push({ id: object.id, ...object.bbox });
  }
  if (boxes.length === 0 || glyphs.length === 0) return previews;

  const owned = new Map<string, PageGlyph[]>();
  const give = (id: string, glyph: PageGlyph) => {
    const list = owned.get(id);
    if (list) list.push(glyph);
    else owned.set(id, [glyph]);
  };

  for (const glyph of glyphs) {
    const [a, b, c, d, e, f] = glyph.matrix;
    const half = Math.max(glyph.width, 0) / 2;
    const x = a * half + c * CENTRE_EM + e;
    const y = b * half + d * CENTRE_EM + f;
    const holders = boxes.filter((box) => distanceTo(box, x, y) === 0);
    if (holders.length > 0) {
      for (const box of holders) give(box.id, glyph);
      continue;
    }
    let nearest: Box | null = null;
    let nearestDistance = Infinity;
    for (const box of boxes) {
      const distance = distanceTo(box, x, y);
      const reach = RUN_END_SHARE * Math.max(box.width, box.height) + Math.min(box.width, box.height);
      if (distance <= reach && distance < nearestDistance) {
        nearest = box;
        nearestDistance = distance;
      }
    }
    if (nearest) give(nearest.id, glyph);
  }

  for (const [id, own] of owned) {
    const text = textInReadingOrder(own, geometry).trim();
    if (text) previews.set(id, text);
  }
  return previews;
}

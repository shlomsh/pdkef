// Whether a photographed page lies on its side (SCAN-32), worked out once when the photo is inspected
// and kept in the page's `turns`, so the person's Rotate acts on top of it. Pure: no DOM.
import { MIN_SIDEWAYS_CONFIDENCE, SIDEWAYS_TURNS, textTurn } from '#lib/pageEnhance/dewarp/orientation.ts';
import { scaleQuad, type GrayImage, type Quad, type RgbaImage } from '#lib/pageEnhance/quad.ts';
import { warpPerspective, warpSizeFor } from '#lib/pageEnhance/warp.ts';

/** The page is flattened to about this long an edge to read its text rows (textTurn's measuring size). */
const READ_LONG_EDGE = 1000;
function grayOf({ width, height, data }: RgbaImage): GrayImage {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j += 1) {
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return { width, height, data: gray };
}

/** The quarter turns (clockwise) that stand the photographed page upright: 0, or SIDEWAYS_TURNS when
 * its text runs down the flattened page clearly enough. `quad` is the page's corners, normalized. */
export function uprightTurns(src: RgbaImage, quad: Quad): number {
  const quadPx = scaleQuad(quad, src.width, src.height);
  const { width, height } = warpSizeFor(quadPx, READ_LONG_EDGE, null);
  let read;
  try {
    read = textTurn(grayOf(warpPerspective(src, quadPx, width, height)));
  } catch {
    // expected: degenerate corners define no perspective; a page whose turn cannot be read stays unturned.
    return 0;
  }
  return read && read.turn === 1 && read.confidence >= MIN_SIDEWAYS_CONFIDENCE ? SIDEWAYS_TURNS : 0;
}

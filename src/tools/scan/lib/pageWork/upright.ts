// Whether a photographed page lies on its side (SCAN-32), worked out once when the photo is inspected
// and kept in the page's `turns`, so the person's Rotate acts on top of it. Pure: no DOM.
import { textTurn } from '../dewarp/orientation.ts';
import { scaleQuad, type GrayImage, type Quad, type RgbaImage } from '../quad.ts';
import { warpPerspective, warpSizeFor } from '../warp.ts';

/** The page is flattened to about this long an edge to read its text rows (textTurn's measuring size). */
const READ_LONG_EDGE = 1000;
/** A sideways reading must be this clear, (win - lose) / (win + lose): three times the other reading's
 * text. textTurn itself says nothing below 1/3; turning a page that was fine is worse than leaving one
 * sideways, which the person can turn with Rotate, so this asks for more. */
const MIN_SIDEWAYS_CONFIDENCE = 0.5;
/** Text cannot tell a quarter turn from three, so a sideways page is turned one quarter clockwise
 * (turns counts clockwise quarters, quad.ts rotateQuad). */
const SIDEWAYS_TURNS = 1;

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

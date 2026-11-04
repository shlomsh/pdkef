// What a photographed or scanned sheet needs and the pieces that give it: assess reads the turn, the
// spine and each page's lean from a small copy, planPage turns that into one Piece per page for the
// full-size source (PE-05). Pure: pixels in, numbers out.
import { bentPx, FLAT_PAGE, measureBend, toGray } from './dewarp/index.ts';
import { MIN_SIDEWAYS_CONFIDENCE, SIDEWAYS_TURNS, textTurn } from './dewarp/orientation.ts';
import { levelQuad, pageLean } from './lean.ts';
import { applyPiece, type Piece } from './piece.ts';
import { scaleQuad, type GrayImage, type Point, type Quad, type RgbaImage } from './quad.ts';
import { findSpine, spreadHalves, type Spine } from './spine.ts';
import { warpSizeFor } from './warp.ts';

/** A lean below this many degrees is below what the eye catches, so leveling it only costs a resample. */
export const MIN_LEAN_DEGREES = 0.5;
/** A page bent less than this many pixels at the small copy's size is flat to the eye. */
const MIN_BENT_PX = 3;
/** The whole sheet, for a page that is not a half of anything. */
const UNIT_QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** What a sheet needs, read from a copy shrunk to about 1000 px on its long edge. */
export interface Assessment {
  /** Clockwise quarter turns that make the sheet's text read across. */
  turn: 0 | 1;
  /** textTurn's confidence, 0 when it says nothing. */
  turnConfidence: number;
  /** In the turned sheet. */
  spine: Spine | null;
  /** Degrees, one per page: left then right on a spread, one otherwise. */
  leans: number[];
  /** Single page only; 0 on a spread. */
  bentPx: number;
  crooked: boolean;
}

/** The pieces that make the sheet's pages, upright and level. */
interface PagePlan { pieces: Piece[] }

const rgbaOf = ({ width, height, data }: GrayImage): RgbaImage => {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 1) out.fill(data[i], i * 4, i * 4 + 3).fill(255, i * 4 + 3, i * 4 + 4);
  return { width, height, data: out };
};

/** The image turned a quarter clockwise: its left column becomes the top row. */
function turnedClockwise({ width, height, data }: GrayImage): GrayImage {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) out[x * height + (height - 1 - y)] = data[y * width + x];
  return { width: height, height: width, data: out };
}

/** One page's pixels at their own scale (a stretched half would change the angle), so pageLean reads the page and nothing across the spine. */
function flattened(gray: GrayImage, quad: Quad): GrayImage {
  return toGray(applyPiece(rgbaOf(gray), pieceOf(quad, gray.width, gray.height, Math.max(gray.width, gray.height))));
}

function bentOf(turned: GrayImage, lean: number): number {
  const quad = levelQuad(UNIT_QUAD, lean, turned.width, turned.height);
  // Edge curves misfire on a scanned sheet, whose border is no page edge.
  const bend = { ...measureBend(rgbaOf(turned), quad, 0, turned.width, turned.height), curves: null };
  return bentPx(bend, 0, turned.width, turned.height);
}

/** What the sheet needs, read from `gray`, the sheet shrunk to about 1000 px on its long edge. */
export function assess(gray: GrayImage): Assessment {
  const read = textTurn(gray);
  const turn = read && read.turn === 1 && read.confidence >= MIN_SIDEWAYS_CONFIDENCE ? SIDEWAYS_TURNS : 0;
  const turned = turn ? turnedClockwise(gray) : gray;
  const spine = findSpine(turned);
  const leans = spine ? spreadHalves(spine).map((half) => pageLean(flattened(turned, half))) : [pageLean(turned)];
  const bent = spine ? 0 : bentOf(turned, leans[0]);
  const crooked = !!turn || !!spine || leans.some((l) => Math.abs(l) >= MIN_LEAN_DEGREES) || bent >= MIN_BENT_PX;
  return { turn, turnConfidence: read?.confidence ?? 0, spine, leans, bentPx: bent, crooked };
}

/** A point of the clockwise-turned sheet, as the same point of the source. */
const unturned = (p: Point): Point => ({ x: p.y, y: 1 - p.x });

function pageQuads(a: Assessment): Quad[] {
  return a.spine ? spreadHalves(a.spine) : [UNIT_QUAD];
}

/** @testSeam One piece per page for `source`, the full-size page in pixels; `gray` and `a` are what assess read. */
export function planPage(gray: GrayImage, a: Assessment, source: { width: number; height: number }): PagePlan {
  const { width, height } = source;
  const longEdge = Math.max(width, height);
  if (!a.crooked) return { pieces: [pieceOf(UNIT_QUAD, width, height, longEdge)] };
  const turnedSize = a.turn ? { width: gray.height, height: gray.width } : gray;
  const pieces = pageQuads(a).map((quad, i) => {
    const level = levelQuad(quad, a.leans[i], turnedSize.width, turnedSize.height);
    return pieceOf(a.turn ? (level.map(unturned) as Quad) : level, width, height, longEdge);
  });
  return { pieces };
}

/** The bend is flat here: a bent page's mesh arrives with PE-09, so the measured bend is not carried. */
function pieceOf(quad: Quad, width: number, height: number, longEdge: number): Piece {
  const size = warpSizeFor(scaleQuad(quad, width, height), longEdge, null);
  return { quad, inset: 0, ...size, bend: FLAT_PAGE, mesh: null };
}

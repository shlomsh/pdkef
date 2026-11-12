// What a photographed or scanned sheet needs and the pieces that give it: assess reads the turn, the
// spine and each page's lean from a small copy, planPage turns that into one Piece per page for the
// full-size source (PE-05). Pure: pixels in, numbers out.
import { bentPx, FLAT_PAGE, measureBend, toGray } from './dewarp/index.ts';
import { pageTurns, turnedClockwise } from './dewarp/orientation.ts';
import { levelQuad, pageLean } from './lean.ts';
import { applyHomography, homography } from './homography.ts';
import { applyPiece, type Piece } from './piece.ts';
import { scaleQuad, type GrayImage, type Point, type Quad } from './quad.ts';
import { readSpine, spreadHalves, type Spine } from './spine.ts';
import { NEW_BOOK, readPhoto, type Book } from './photoPage.ts';
import { rgbaOf, textBlockCorners, type SpineSide } from './textBlock.ts';
import { warpSizeFor } from './warp.ts';

/** A lean below this many degrees is below what the eye catches, so leveling it only costs a resample. */
export const MIN_LEAN_DEGREES = 0.5;
/** The share of a half's width the gutter takes on a page with too little text to find corners from; the book PDF's text starts about 6% in. */
const GUTTER_SHARE = 0.03;
/** A page bent less than this many pixels at the small copy's size is flat to the eye. */
const MIN_BENT_PX = 3;
/** The whole sheet, for a page that is not a half of anything. */
const UNIT_QUAD: Quad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

/** What a sheet needs, read from a copy shrunk to about 1000 px on its long edge. */
export interface Assessment {
  /** Clockwise quarter turns that stand the sheet's text up. */
  turn: number;
  /** textTurn's confidence, 0 when it says nothing. */
  turnConfidence: number;
  /** In the turned sheet: a line sure enough to split on. */
  spine: Spine | null;
  /** In the turned sheet: where two pages may meet, for a person to say. Null when the sheet is sure either way. */
  possibleSpine: Spine | null;
  /** Degrees, one per page: left then right on a spread, one otherwise. */
  leans: number[];
  /** One per page, in the turned sheet, 0..1: corners that square the page's text block; null where there are too few rows. */
  corners: (Quad | null)[];
  /** Single page only; 0 on a spread. */
  bentPx: number;
  crooked: boolean;
  /** The book read so far with this sheet counted: whether its sheets are photos, and its text width (SCAN-69). */
  book: Book;
}

/** The pieces that make the sheet's pages, upright and level. */
interface PagePlan { pieces: Piece[] }

/** One page's pixels at their own scale (a stretched half would change the angle), so pageLean reads the page and nothing across the spine. */
function flattened(gray: GrayImage, quad: Quad): GrayImage {
  return toGray(applyPiece(rgbaOf(gray), pieceOf(quad, gray.width, gray.height, Math.max(gray.width, gray.height))));
}

/** Where the spine lies on each page of a spread, left page first. */
const SPINE_SIDES: SpineSide[] = ['right', 'left'];

/** The half with the gutter taken off its spine side. */
function withoutGutter(half: Quad, spine: SpineSide): Quad {
  const toward = (p: Point, q: Point): Point => ({ x: p.x + (q.x - p.x) * GUTTER_SHARE, y: p.y + (q.y - p.y) * GUTTER_SHARE });
  const [tl, tr, br, bl] = half;
  return spine === 'right' ? [tl, toward(tr, tl), toward(br, bl), bl] : [toward(tl, tr), tr, br, toward(bl, br)];
}

/** Corners that square `half`'s text block, in the sheet's 0..1, read on the page levelled first. */
function foundCorners(turned: GrayImage, half: Quad, lean: number, spine: SpineSide): Quad | null {
  const level = levelQuad(half, lean, turned.width, turned.height);
  const corners = textBlockCorners(flattened(turned, level), spine);
  const toSheet = homography(UNIT_QUAD, level);
  return corners && (corners.map((p) => applyHomography(toSheet, p)) as Quad);
}

function bentOf(turned: GrayImage, lean: number): number {
  const quad = levelQuad(UNIT_QUAD, lean, turned.width, turned.height);
  return bentPx(measureBend(rgbaOf(turned), quad, 0, turned.width, turned.height, false), 0, turned.width, turned.height);
}

/** What the sheet needs, read from `gray`, the sheet shrunk to about 1000 px on its long edge. `book` is what the
 * same PDF's sheets before it said; a sheet on its own is a book of one. */
export function assess(gray: GrayImage, book: Book = NEW_BOOK): Assessment {
  const { turns: turn, confidence } = pageTurns(gray);
  const turned = turnedClockwise(gray, turn);
  const read = readSpine(turned);
  const spine = read?.sure ? read.spine : null;
  const possibleSpine = read && !read.sure ? read.spine : null;
  if (spine) return { turn, turnConfidence: confidence, possibleSpine, ...spreadRead(turned, spine), book };
  const leans = [pageLean(turned)];
  // A photo's lines are traced along their own curve and lean, and levelling it first would bring white corners in where
  // the table was (SCAN-69).
  const photo = readPhoto(turned, book);
  // A photo whose text gives no block is read like a scan, which may still find one.
  const corners = [photo.corners ?? foundCorners(turned, UNIT_QUAD, leans[0], null)];
  const bent = bentOf(turned, leans[0]);
  // A photo's page is only part of the sheet, so it is cut out however level it stands.
  const crooked = !!turn || Math.abs(leans[0]) >= MIN_LEAN_DEGREES || bent >= MIN_BENT_PX || !!(photo.photo && photo.corners);
  return { turn, turnConfidence: confidence, spine, possibleSpine, leans, corners, bentPx: bent, crooked, book: photo.book };
}

/** Each page of a sheet with a line down it, read on its own: its lean, then the corners of its text. */
function spreadRead(turned: GrayImage, spine: Spine): Pick<Assessment, 'spine' | 'leans' | 'corners' | 'bentPx' | 'crooked'> {
  const halves = spreadHalves(spine);
  const leans = halves.map((half) => pageLean(flattened(turned, half)));
  const corners = halves.map((half, i) => foundCorners(turned, half, leans[i], SPINE_SIDES[i]));
  return { spine, leans, corners, bentPx: 0, crooked: true };
}

/** The two pages' corners, left page first, for a line a person placed on `gray`, an upright sheet: the same read as a found line. */
export function spreadQuads(gray: GrayImage, spine: Spine): Quad[] {
  const a = { turn: 0, turnConfidence: 0, possibleSpine: null, ...spreadRead(gray, spine), book: NEW_BOOK };
  return planPage(gray, a, gray).pieces.map((piece) => piece.quad);
}

/** A point of the sheet turned `turns` quarters clockwise, as the same point of the source. */
function unturned(p: Point, turns: number): Point {
  return turns === 0 ? p : unturned({ x: p.y, y: 1 - p.x }, turns - 1);
}

function pageQuads(a: Assessment): Quad[] {
  return a.spine ? spreadHalves(a.spine).map((half, i) => withoutGutter(half, SPINE_SIDES[i])) : [UNIT_QUAD];
}

/** One piece per page for `source`, the full-size page in pixels; `gray` and `a` are what assess read. */
export function planPage(gray: GrayImage, a: Assessment, source: { width: number; height: number }): PagePlan {
  const { width, height } = source;
  const longEdge = Math.max(width, height);
  if (!a.crooked) return { pieces: [pieceOf(UNIT_QUAD, width, height, longEdge)] };
  const turnedSize = a.turn % 2 ? { width: gray.height, height: gray.width } : gray;
  const pieces = pageQuads(a).map((quad, i) => {
    const page = a.corners[i] ?? levelQuad(quad, a.leans[i], turnedSize.width, turnedSize.height);
    return pieceOf(page.map((p) => unturned(p, a.turn)) as Quad, width, height, longEdge);
  });
  return { pieces };
}

/** The bend is flat here: a bent page's mesh arrives with PE-09, so the measured bend is not carried. */
function pieceOf(quad: Quad, width: number, height: number, longEdge: number): Piece {
  const size = warpSizeFor(scaleQuad(quad, width, height), longEdge, null);
  return { quad, inset: 0, ...size, bend: FLAT_PAGE, mesh: null };
}

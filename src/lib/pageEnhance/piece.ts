// One piece of a page, and the single resample that makes it (PE-02). Scan makes one piece per page,
// a book spread one per half, and a fold is a mesh on its one piece. Pure: pixels in, pixels out.
import { isFlat, pageMap, type PageBend } from './dewarp/index.ts';
import { warpAlong, type PageMap } from './dewarp/meshWarp.ts';
import { insetQuad, scaleQuad, type Quad, type RgbaImage } from './quad.ts';
import { warpPerspective } from './warp.ts';

export interface Piece {
  /** The piece's corners, 0..1 across the source, so a plan made on a small copy applies to the full image. */
  quad: Quad;
  /** How far inside its corners the piece is cropped, as insetQuad takes it. */
  inset: number;
  width: number;
  height: number;
  bend: PageBend;
  /** Output (x, y), 0..1 across the piece, to source pixels; replaces the bend when present. */
  mesh: PageMap | null;
}

/** The margin pageMap crops for this inset: insetQuad moves corners toward the centre, so half of it per side. */
export const pieceMargin = (piece: Piece) => piece.inset / 2;

/** @testSeam True when the corners alone place every pixel: no bend, no mesh. */
export const isAffine = (piece: Piece) => isFlat(piece.bend) && !piece.mesh;

/** The piece, resampled from the source exactly once. A flat piece keeps the plain homography. */
export function applyPiece(src: RgbaImage, piece: Piece): RgbaImage {
  const { quad, inset, width, height, bend, mesh } = piece;
  if (isAffine(piece)) return warpPerspective(src, scaleQuad(insetQuad(quad, inset), src.width, src.height), width, height);
  return warpAlong(src, mesh ?? pageMap(scaleQuad(quad, src.width, src.height), pieceMargin(piece), bend), width, height);
}

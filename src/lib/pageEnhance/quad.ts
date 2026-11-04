// The shapes every Scan module shares (docs/scan-to-pdf.md, "Contract"). A quad
// a person sees or stores is normalized (0..1) in the upright photo; pixel quads
// exist only inside the pipeline. Pure: no DOM.

export interface Point { x: number; y: number }
/** Top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];
/** ImageData-shaped: four bytes a pixel, row-major. */
export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray }
/** One byte a pixel, row-major. */
export interface GrayImage { width: number; height: number; data: Uint8ClampedArray }

/** Four points in any order, as top-left, top-right, bottom-right, bottom-left (clockwise on screen). */
export function orderQuad(points: Point[]): Quad {
  if (points.length !== 4) throw new Error(`orderQuad needs 4 points, got ${points.length}`);
  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / 4;
  // Clockwise on screen (y grows downwards) is increasing atan2 angle.
  const byAngle = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < 4; i += 1) {
    const diff = byAngle[i].x + byAngle[i].y - (byAngle[start].x + byAngle[start].y);
    // A page turned 45 degrees ties two corners: prefer the higher one (smaller y).
    if (diff < -1e-9 || (Math.abs(diff) <= 1e-9 && byAngle[i].y < byAngle[start].y)) start = i;
  }
  return [0, 1, 2, 3].map((i) => byAngle[(start + i) % 4]) as Quad;
}

/** A normalized quad in pixels of a `width` x `height` image. */
export function scaleQuad(quad: Quad, width: number, height: number): Quad {
  return quad.map((p) => ({ x: p.x * width, y: p.y * height })) as Quad;
}

/** Each corner moved toward the middle by `fraction` of its distance from it. The warp crops this,
 * so pixels sampled right on the outline (half page, half table) never become a dark edge line. */
export function insetQuad(quad: Quad, fraction: number): Quad {
  const cx = quad.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = quad.reduce((sum, p) => sum + p.y, 0) / 4;
  return quad.map((p) => ({ x: p.x + (cx - p.x) * fraction, y: p.y + (cy - p.y) * fraction })) as Quad;
}

/** The corners for the page turned `turns` quarter turns clockwise (any integer; 4 is a full turn,
 * negative turns go the other way). The warp maps quad[0] to the output's top-left, so one turn
 * makes the photo's bottom-left corner the page's top-left: [q3, q0, q1, q2]. */
export function rotateQuad(quad: Quad, turns: number): Quad {
  const n = ((turns % 4) + 4) % 4;
  return [0, 1, 2, 3].map((i) => quad[(i - n + 4) % 4]) as Quad;
}

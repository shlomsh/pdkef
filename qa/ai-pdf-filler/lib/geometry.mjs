/**
 * Pure coordinate maths shared by everything that has to agree about where a field is: the flat
 * drawing, the scan renderer, the expected-field derivation and the preview overlay.
 *
 * Three systems appear here:
 *  - page points, TOP-LEFT origin, y down (how forms.mjs and the scoring ground truth think);
 *  - PDF user space points, BOTTOM-LEFT origin (what the PDF operators want);
 *  - pixels of a rendered image, TOP-LEFT origin, y down.
 * A 2D affine matrix is `[a, b, c, d, e, f]` with `x' = a*x + c*y + e` and `y' = b*x + d*y + f`
 * (the same order canvas `setTransform` and pdf.js use).
 */
import { PAGE } from '../forms.mjs';

const POINTS_PER_INCH = 72;
const DEGREES_TO_RADIANS = Math.PI / 180;

export const round = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** A top-left-origin rect in page points -> PDF user space (`y` becomes the bottom edge). */
export const toPdfRect = ({ x, y, width, height }) => ({ x, y: PAGE.height - y - height, width, height });

export const cornersOf = ({ x, y, width, height }) => [
  { x, y }, { x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height },
];

export const applyMatrix = ([a, b, c, d, e, f], { x, y }) => ({ x: a * x + c * y + e, y: b * x + d * y + f });

/** Axis-aligned bounding box of a set of points, as `{x, y, width, height}`. */
export function boundingBox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Pixel size of the whole page at `dpi` and the scale-only matrix from page points to pixels. */
export function pageRasterAt(dpi) {
  const pixelWidth = Math.round((PAGE.width * dpi) / POINTS_PER_INCH);
  const pixelHeight = Math.round((PAGE.height * dpi) / POINTS_PER_INCH);
  return { pixelWidth, pixelHeight, matrix: [pixelWidth / PAGE.width, 0, 0, pixelHeight / PAGE.height, 0, 0] };
}

/**
 * The scanner's effect on the page: scale to `dpi`, rotate `rotateDeg` about the image centre
 * (positive = clockwise as seen on screen, which is canvas `rotate()` in a y-down space), then
 * translate by `offsetPx`. `matrix` maps page points (top-left origin) to scan pixels; the scan
 * renderer and the expected-field derivation both use exactly this matrix.
 */
export function scanGeometry({ dpi, rotateDeg, offsetPx }) {
  const { pixelWidth, pixelHeight, matrix: [sx, , , sy] } = pageRasterAt(dpi);
  const cos = Math.cos(rotateDeg * DEGREES_TO_RADIANS);
  const sin = Math.sin(rotateDeg * DEGREES_TO_RADIANS);
  const centreX = pixelWidth / 2;
  const centreY = pixelHeight / 2;
  const matrix = [
    cos * sx, sin * sx, -sin * sy, cos * sy,
    centreX - (cos * centreX - sin * centreY) + offsetPx.x,
    centreY - (sin * centreX + cos * centreY) + offsetPx.y,
  ];
  return { pixelWidth, pixelHeight, matrix };
}

/** Pixels of a full-page image back to page points (the scan is placed edge to edge). */
export const pixelRectToPoints = (rect, { pixelWidth, pixelHeight }) => {
  const sx = PAGE.width / pixelWidth;
  const sy = PAGE.height / pixelHeight;
  return { x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy };
};

/**
 * RED-17: proves a saved Blackout or Whiteout box is one flat colour. Pure;
 * no DOM, no pdf.js import. The image is one rendered page (RGBA), boxes are
 * that page's boxes in page-percent units (see `types.ts`). A box's area is
 * inset on every side before checking, because an anti-aliased edge is
 * expected to blend with what is underneath; the inset margin is not.
 *
 * Blur boxes are never checked: RED-24's default strength is medium, and a
 * person who picked light chose it knowingly. There is no "solid enough"
 * verdict for a blur.
 */
import type { BoxSolidity, CheckBox } from './types.ts';

interface PageImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

interface SolidityOptions {
  /** Pixels inset from each edge of the box before checking. */
  insetPx?: number;
  /** Max per-channel deviation from the fill colour still counted as solid. */
  tolerance?: number;
}

const DEFAULT_INSET_PX = 2;
const DEFAULT_TOLERANCE = 24;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function defaultColorFor(type: CheckBox['type']): string {
  return type === 'whiteout' ? '#ffffff' : '#000000';
}

/** Checks one box's inset area against every pixel in `image`. */
function checkBox(image: PageImage, box: CheckBox, insetPx: number, tolerance: number): boolean {
  const [targetR, targetG, targetB] = hexToRgb(box.color || defaultColorFor(box.type));

  const boxX = (box.left / 100) * image.width;
  const boxY = (box.top / 100) * image.height;
  const boxW = (box.width / 100) * image.width;
  const boxH = (box.height / 100) * image.height;

  const x0 = Math.max(0, Math.round(boxX + insetPx));
  const y0 = Math.max(0, Math.round(boxY + insetPx));
  const x1 = Math.min(image.width, Math.round(boxX + boxW - insetPx));
  const y1 = Math.min(image.height, Math.round(boxY + boxH - insetPx));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const offset = (y * image.width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      if (
        Math.abs(r - targetR) > tolerance ||
        Math.abs(g - targetG) > tolerance ||
        Math.abs(b - targetB) > tolerance
      ) {
        return false;
      }
    }
  }
  return true;
}

/** Checks every blackout/whiteout box in `boxes` against `image`. Blur boxes
 * get no entry. `boxIndex` is the index into `boxes` as passed in. */
export function boxSolidity(image: PageImage, boxes: CheckBox[], options?: SolidityOptions): BoxSolidity[] {
  const insetPx = options?.insetPx ?? DEFAULT_INSET_PX;
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;

  const results: BoxSolidity[] = [];
  boxes.forEach((box, boxIndex) => {
    if (box.type === 'blur') return;
    results.push({ boxIndex, solid: checkBox(image, box, insetPx, tolerance) });
  });
  return results;
}

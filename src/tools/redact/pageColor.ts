import type { ColorMode } from './redactElements.ts';

// RED-51: the "auto" whiteout colour is the median of a thin ring of page
// pixels just outside the box. Pure maths here; the canvas reads live in
// pageSampling.ts.

/** A rectangle in canvas pixels. */
export interface PixelRect { x: number; y: number; width: number; height: number }

/** A box in Redact's element unit: percent (0-100) of the page. */
export interface PercentBox { left: number; top: number; width: number; height: number }

const clamp = (v: number, max: number) => Math.min(max, Math.max(0, v));

/** The canvas pixels a percent box covers, rounded outwards and clamped to the canvas. */
export function boxPixelRect(box: PercentBox, canvasWidth: number, canvasHeight: number): PixelRect {
  const x = clamp(Math.floor((box.left / 100) * canvasWidth), canvasWidth);
  const y = clamp(Math.floor((box.top / 100) * canvasHeight), canvasHeight);
  const right = clamp(Math.ceil(((box.left + box.width) / 100) * canvasWidth), canvasWidth);
  const bottom = clamp(Math.ceil(((box.top + box.height) / 100) * canvasHeight), canvasHeight);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** The band `thickness` px wide just outside `rect`, as up to four strips that
 * never overlap (top and bottom span the corners), clipped to the canvas. */
export function ringStrips(rect: PixelRect, thickness: number, canvasWidth: number, canvasHeight: number): PixelRect[] {
  if (!(thickness > 0)) return [];
  const t = thickness;
  const wide = { x: rect.x - t, width: rect.width + 2 * t };
  const strips: PixelRect[] = [
    { ...wide, y: rect.y - t, height: t },
    { ...wide, y: rect.y + rect.height, height: t },
    { x: rect.x - t, y: rect.y, width: t, height: rect.height },
    { x: rect.x + rect.width, y: rect.y, width: t, height: rect.height },
  ];
  const out: PixelRect[] = [];
  for (const s of strips) {
    const x0 = Math.max(0, s.x);
    const y0 = Math.max(0, s.y);
    const x1 = Math.min(canvasWidth, s.x + s.width);
    const y1 = Math.min(canvasHeight, s.y + s.height);
    if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return out;
}

const hex = (n: number) => n.toString(16).padStart(2, '0');

/** The per-channel lower median of RGBA runs, composited over white, as
 * '#rrggbb'. Unpainted (alpha 0) pixels are skipped; null if none are left. */
export function medianColor(runs: readonly ArrayLike<number>[]): string | null {
  const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (const run of runs) {
    for (let i = 0; i + 3 < run.length; i += 4) {
      const a = run[i + 3];
      if (a === 0) continue;
      for (let c = 0; c < 3; c++) {
        bins[c][Math.round((run[i + c] * a) / 255 + 255 * (1 - a / 255))]++;
      }
      n++;
    }
  }
  if (n === 0) return null;
  const target = Math.ceil(n / 2);
  let out = '#';
  for (let c = 0; c < 3; c++) {
    let seen = 0;
    let v = 0;
    for (; v < 256; v++) {
      seen += bins[c][v];
      if (seen >= target) break;
    }
    out += hex(v);
  }
  return out;
}

/** True for a whiteout (box or brush stroke) whose colour follows the page. */
export function followsPage(el: { type: string; colorMode?: ColorMode }): boolean {
  return (el.type === 'whiteout' || el.type === 'whiteoutStroke') && el.colorMode === 'auto';
}

/** The extra `{ color }` an edit needs so an auto whiteout keeps matching the
 * page: only when it moved, resized or just became auto. `sample` reads the page. */
export function autoColorChanges<T extends { type: string; pageIndex: number; color?: string; colorMode?: ColorMode } & PercentBox>(
  element: T,
  changes: Partial<T>,
  sample: (pageIndex: number, box: PercentBox) => string | null,
): Partial<T> {
  const next = { ...element, ...changes };
  if (!followsPage(next)) return {};
  const geometry = (['left', 'top', 'width', 'height'] as const).some((k) => Object.prototype.hasOwnProperty.call(changes, k));
  if (!geometry && changes.colorMode !== 'auto') return {};
  const color = sample(next.pageIndex, { left: next.left, top: next.top, width: next.width, height: next.height });
  if (color === null || color === next.color) return {};
  return { color } as Partial<T>;
}

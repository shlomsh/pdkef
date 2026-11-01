export type FitMode = 'width' | 'text' | 'page';
export type ZoomSetting = FitMode | number;
export interface PageBox { width: number; height: number; textLeft: number; textRight: number }
export interface Viewport { width: number; height: number }

export const ZOOM_MIN = 0.5, ZOOM_MAX = 3;
/** A fit may go below the zoom floor: a wide page (an A4 turned sideways) in a phone's column needs about 0.45. */
const FIT_MIN = 0.1;
const STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const TEXT_GUTTER = 16;
const SIDE_PAD = 16;
export const NOTES_W = 284;

const EPS = 1e-6;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

export function fitScale(
  mode: FitMode,
  page: PageBox,
  view: Viewport,
  opts: { noted: boolean; capsuleH?: number; pad?: number },
): number {
  // The notes column is page-space: it scales with the zoom, so the fit solves page plus notes together.
  const avail = view.width - 2 * (opts.pad ?? SIDE_PAD);
  const notes = opts.noted ? NOTES_W : 0;
  const width = avail / (page.width + notes);
  if (mode === 'width') return clampFit(width);
  if (mode === 'text') {
    const text = avail / (page.textRight - page.textLeft + 2 * TEXT_GUTTER + notes);
    return clampFit(Math.max(text, width));
  }
  return clampFit(Math.min(width, (view.height - (opts.capsuleH ?? 88)) / page.height));
}

function clampFit(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(FIT_MIN, z));
}

export function stepZoom(current: number, dir: 1 | -1): number {
  const next = dir === 1
    ? STEPS.find((s) => s > current + EPS)
    : [...STEPS].reverse().find((s) => s < current - EPS);
  // No step past a fit below the floor: stay there rather than clamp, which would turn "out" into a zoom in.
  return next === undefined ? current : clampZoom(next);
}

export function resolveZoom(setting: ZoomSetting, page: PageBox, view: Viewport, opts: { noted: boolean }): number {
  return typeof setting === 'number' ? clampZoom(setting) : fitScale(setting, page, view, opts);
}

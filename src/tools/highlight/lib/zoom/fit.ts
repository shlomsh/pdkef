export type FitMode = 'width' | 'text' | 'page';
export type ZoomSetting = FitMode | number;
export interface PageBox { width: number; height: number; textLeft: number; textRight: number }
export interface Viewport { width: number; height: number }

type NotesUnit = 'px' | 'page';

/** @testSeam */
export const ZOOM_MIN = 0.5, ZOOM_MAX = 3;
/** A fit may go below the zoom floor: a wide page (an A4 turned sideways) in a phone's column needs about 0.45. */
const FIT_MIN = 0.1;
const STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const TEXT_GUTTER = 16;
const SIDE_PAD = 16;
/** The notes column: px beside the page in the normal view, page units (it scales with the zoom) in the lamp. */
export const NOTES_W = 240;

const EPS = 1e-6;

/** `floor` is the lowest zoom allowed: ZOOM_MIN, or in the lamp the whole-page fit, which may be above or below it. */
export function clampZoom(z: number, floor = ZOOM_MIN): number {
  return Math.min(ZOOM_MAX, Math.max(floor, z));
}

export function fitScale(
  mode: FitMode,
  page: PageBox,
  view: Viewport,
  opts: { noted: boolean; notesIn?: NotesUnit; capsuleH?: number; pad?: number },
): number {
  // In page units the notes column scales with the zoom, so the fit solves page plus notes together; in px it
  // is taken off the width first and the page fits what is left.
  const px = opts.noted && opts.notesIn === 'px';
  const avail = view.width - 2 * (opts.pad ?? SIDE_PAD) - (px ? NOTES_W : 0);
  const notes = opts.noted && !px ? NOTES_W : 0;
  const width = avail / (page.width + notes);
  if (mode === 'width') return clampFit(width);
  if (mode === 'text') {
    // The lamp's px notes grow with the zoom over its Fit width (chrome = z / width): solve them in page units.
    const textW = page.textRight - page.textLeft + 2 * TEXT_GUTTER;
    const text = px
      ? (view.width - 2 * (opts.pad ?? SIDE_PAD)) / (textW + NOTES_W / width)
      : avail / (textW + notes);
    return clampFit(Math.max(text, width));
  }
  return clampFit(Math.min(width, (view.height - (opts.capsuleH ?? 88)) / page.height));
}

function clampFit(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(FIT_MIN, z));
}

export function stepZoom(current: number, dir: 1 | -1, floor = ZOOM_MIN): number {
  if (dir === 1) {
    const up = STEPS.find((s) => s > current + EPS);
    return up === undefined ? current : clampZoom(up, floor);
  }
  // A step out that would pass the floor lands on it; at or below it, stay rather than clamp, which would turn "out" into a zoom in.
  const down = [...STEPS].reverse().find((s) => s < current - EPS);
  const next = Math.max(down ?? floor, floor);
  return next >= current - EPS ? current : next;
}

export function resolveZoom(setting: ZoomSetting, page: PageBox, view: Viewport, opts: { noted: boolean; notesIn?: NotesUnit }, floor = ZOOM_MIN): number {
  return typeof setting === 'number' ? clampZoom(setting, floor) : fitScale(setting, page, view, opts);
}

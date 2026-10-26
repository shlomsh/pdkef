// The magnifier a corner drag shows on touch, so the finger never hides the point it places.
// Pure: where the loupe goes, and what it draws. CornerEditor writes both to the DOM mid-drag.
import type { Point } from './quad.ts';

export const LOUPE_SIZE = 112;
export const LOUPE_ZOOM = 2.5;
/** Clear space between the touch point and the loupe: a fingertip, with room to see past it. */
export const LOUPE_GAP = 56;
export const LOUPE_MARGIN = 8;

interface Size { width: number; height: number }
interface At { left: number; top: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * The loupe's top-left corner in viewport pixels. Above the finger first (where scanner apps and
 * iOS text selection put it), sliding along the edge near a side; beside the finger, towards the
 * middle of the screen, when the top edge leaves no room; below it as the last resort.
 */
export function placeLoupe(touch: Point, viewport: Size, size = LOUPE_SIZE, gap = LOUPE_GAP, margin = LOUPE_MARGIN): At {
  const fitsLeft = (left: number) => left >= margin && left + size <= viewport.width - margin;
  const fitsTop = (top: number) => top >= margin && top + size <= viewport.height - margin;
  const alongX = clamp(touch.x - size / 2, margin, viewport.width - margin - size);
  const alongY = clamp(touch.y - size / 2, margin, viewport.height - margin - size);

  const above = touch.y - gap - size;
  if (fitsTop(above)) return { left: alongX, top: above };
  const beside = touch.x < viewport.width / 2 ? touch.x + gap : touch.x - gap - size;
  if (fitsLeft(beside)) return { left: beside, top: alongY };
  const below = touch.y + gap;
  if (fitsTop(below)) return { left: alongX, top: below };
  // A screen too small for any of them: keep it on screen, above or below whichever has more room.
  return { left: alongX, top: touch.y > viewport.height / 2 ? margin : viewport.height - margin - size };
}

export interface LoupeEdge { x1: number; y1: number; x2: number; y2: number }
export interface LoupeView { backgroundSize: string; backgroundPosition: string; edges: [LoupeEdge, LoupeEdge] }

/**
 * What the loupe shows: the photo magnified `zoom` times with `point` (normalized) at its centre,
 * and the two edges that meet there, drawn towards the neighbouring corners. `image` is the photo's
 * rendered size in pixels.
 */
export function loupeView(point: Point, neighbours: [Point, Point], image: Size, size = LOUPE_SIZE, zoom = LOUPE_ZOOM): LoupeView {
  const w = image.width * zoom;
  const h = image.height * zoom;
  const c = size / 2;
  const edge = (to: Point): LoupeEdge => ({ x1: c, y1: c, x2: c + (to.x - point.x) * w, y2: c + (to.y - point.y) * h });
  return {
    backgroundSize: `${w}px ${h}px`,
    backgroundPosition: `${c - point.x * w}px ${c - point.y * h}px`,
    edges: [edge(neighbours[0]), edge(neighbours[1])],
  };
}

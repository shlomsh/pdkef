/** Pure box math for the lamp's entrance and exit: all in viewport pixels. */
export interface Rect { left: number; top: number; width: number; height: number }
export interface Circle { cx: number; cy: number; r: number }
export interface Size { width: number; height: number }

export const circleBox = ({ cx, cy, r }: Circle): Rect => ({ left: cx - r, top: cy - r, width: 2 * r, height: 2 * r });

export const circleOf = (rect: Rect): Circle => ({ cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, r: Math.min(rect.width, rect.height) / 2 });

/** A box as the four style values a keyframe animates. */
export const boxStyle = (b: Rect) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });

/** The transform that puts the element, now at `last`, back on `first` (transform-origin 0 0). */
export const flipTransform = (first: Rect, last: Rect) => `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width})`;

/**
 * Where the bead is when the entrance starts. Real fullscreen resizes the window first, so the old spot means
 * nothing: the bead then starts in the capsule's column, kept inside the new height.
 */
export function beadStart({ bead, before, viewport, capsuleCx }: { bead: Circle; before: Size; viewport: Size; capsuleCx: number }): Circle {
  if (before.width === viewport.width && before.height === viewport.height) return bead;
  return { cx: capsuleCx, cy: Math.min(bead.cy, viewport.height - bead.r), r: bead.r };
}

const DESKTOP_CONE = 1700;
const PHONE_CONE = 760;
/** The lamp's light: a cone from just above the capsule's centre down past the bottom edge. */
export function coneBox(from: { cx: number; cy: number }, viewport: Size): Rect {
  const width = viewport.width >= 900 ? DESKTOP_CONE : PHONE_CONE;
  return { left: from.cx - width / 2, top: from.cy - 10, width, height: viewport.height - from.cy + 40 };
}

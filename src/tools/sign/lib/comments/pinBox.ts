/** A pin's box is a square of this width, in percent of the page width. */
const PIN_WIDTH_PERCENT = 2.4;

/** A pin's square box (in points) centered on a page-percent point, kept on the page. Pure. */
export function pinBox(center: { x: number; y: number }, page: { width: number; height: number }): { left: number; top: number; width: number; height: number } {
  const width = PIN_WIDTH_PERCENT;
  const height = (PIN_WIDTH_PERCENT * page.width) / page.height;
  const clamp = (v: number, size: number) => Math.min(100 - size, Math.max(0, v - size / 2));
  return { left: clamp(center.x, width), top: clamp(center.y, height), width, height };
}

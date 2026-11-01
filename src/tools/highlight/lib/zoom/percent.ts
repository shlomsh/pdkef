/** Actual size is 4/3 CSS px per PDF point (96 dpi against 72). */
export const ACTUAL_SIZE = 4 / 3;

export function zoomPercent(zoom: number): number {
  return Math.round((zoom / ACTUAL_SIZE) * 100);
}

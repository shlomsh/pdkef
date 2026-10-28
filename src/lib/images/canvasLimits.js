/** Largest canvas area in pixels (4096 x 4096): iOS Safari's limit, the smallest we support. */
export const MAX_CANVAS_AREA = 16_777_216;
/** Longest canvas side in pixels. */
export const MAX_CANVAS_SIDE = 16_384;

/**
 * The render scale for a canvas whose content is `unitWidth` x `unitHeight`
 * at scale 1: the wanted scale, lowered so the canvas stays inside the
 * browser's area and side limits. Past them a canvas comes back blank (or
 * toDataURL returns an empty "data:,").
 */
export function clampScaleToCanvas(unitWidth, unitHeight, wantedScale) {
  return Math.min(
    wantedScale,
    Math.sqrt(MAX_CANVAS_AREA / (unitWidth * unitHeight)),
    MAX_CANVAS_SIDE / unitWidth,
    MAX_CANVAS_SIDE / unitHeight,
  );
}

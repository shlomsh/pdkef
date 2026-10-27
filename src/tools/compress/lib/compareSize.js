const MIN_PREVIEW_WIDTH = 900;
const MAX_PREVIEW_WIDTH = 2400;

/**
 * Pixel width to rasterize a compare preview at: what the slider will
 * actually paint (its css width times the device pixel ratio), clamped so a
 * small phone never gets a soft image and a huge screen never balloons decode
 * time or memory.
 *
 * @param {number} viewportCssPx  window.innerWidth
 * @param {number} devicePixelRatio
 * @param {number} cssMaxPx  widest the slider can be, in css px
 */
export function comparePreviewWidth(viewportCssPx, devicePixelRatio, cssMaxPx) {
  const wanted = Math.round(Math.min(viewportCssPx, cssMaxPx) * devicePixelRatio);
  return Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, wanted));
}

/**
 * Generic byte-budget search shared by every "compress to a target size" tool
 * (`compressPdfToTarget` in compress.js, `compressImageToTarget` in
 * compressImage.js): walk a fidelity ladder from highest to lowest, and at
 * each step binary-search an encode quality for the highest value that still
 * fits the budget. Keeps the smallest result seen as an honest fallback if
 * nothing fits, and respects a wall-clock deadline so a large or adversarial
 * input can't hang the tab.
 *
 * Pure and DOM-free on purpose, so it has no opinion on what a "scale" or a
 * "handle" is - callers inject:
 *   - `renderAtScale(scale, scaleIndex) -> handle`, producing whatever the
 *     caller wants to hold onto for that scale (a canvas, or a list of them
 *     for a multi-page document).
 *   - `encode(handle, quality) -> encoded`, where `encoded` exposes `.size`
 *     in bytes. A single Blob already satisfies that; a caller encoding
 *     several pieces at once (e.g. one canvas per PDF page) can return a
 *     small `{ size, ...payload }` wrapper instead. The search never
 *     inspects `encoded` beyond `.size`, so it never needs to know which
 *     shape it got.
 */

/**
 * @param {Object} options
 * @param {number[]} options.scales - tried in order; first is highest fidelity.
 * @param {(scale: number, scaleIndex: number) => (any | Promise<any>)} options.renderAtScale
 * @param {(handle: any, quality: number) => Promise<{ size: number }>} options.encode
 * @param {number} options.budgetBytes - the byte budget a result must fit under.
 * @param {number} options.minQuality
 * @param {number} options.maxQuality
 * @param {number} [options.qualitySteps=6] - binary search iterations per scale.
 * @param {number} options.deadlineMs - `Date.now()`-comparable deadline; once
 *   passed, the search ships the best result found so far instead of trying
 *   further scales or quality steps.
 * @returns {Promise<{ scale: number, scaleIndex: number, handle: any, quality: number, encoded: { size: number } }>}
 */
export async function searchTargetSize({
  scales,
  renderAtScale,
  encode,
  budgetBytes,
  minQuality,
  maxQuality,
  qualitySteps = 6,
  deadlineMs,
}) {
  let best = null; // { scale, scaleIndex, handle, quality, encoded }

  for (let scaleIndex = 0; scaleIndex < scales.length; scaleIndex += 1) {
    if (best && Date.now() > deadlineMs) break; // time's up - ship the best-effort result
    const scale = scales[scaleIndex];
    const handle = await renderAtScale(scale, scaleIndex);

    // Keep the smallest result seen so far as a fallback, in case no step
    // (even the lowest fidelity at minimum quality) fits the budget.
    const floorEncoded = await encode(handle, minQuality);
    if (!best || floorEncoded.size < best.encoded.size) {
      best = { scale, scaleIndex, handle, quality: minQuality, encoded: floorEncoded };
    }

    if (floorEncoded.size > budgetBytes) continue; // even minimum quality is too big at this scale

    // Binary search the highest quality, at this scale, that still fits.
    let lo = minQuality;
    let hi = maxQuality;
    let feasible = best;
    for (let step = 0; step < qualitySteps; step += 1) {
      if (Date.now() > deadlineMs) break; // time's up - keep the best quality found so far
      const mid = (lo + hi) / 2;
      const encoded = await encode(handle, mid);
      if (encoded.size <= budgetBytes) {
        feasible = { scale, scaleIndex, handle, quality: mid, encoded };
        lo = mid;
      } else {
        hi = mid;
      }
    }

    best = feasible;
    break; // this scale fits the budget - no need to drop further
  }

  return best;
}

/**
 * Decides which Link annotations should go with the PDF objects Delete just
 * removed. A tracking footer is often its own image *and* a Link annotation
 * laid exactly on top of it (RED-27's CamScanner footer): deleting the image
 * alone leaves an invisible, still-clickable link to the tracker's address.
 *
 * Pure geometry, no pdf-lib types: the adapter reads `/Rect` and `bbox`
 * values and hands them in as plain numbers/objects, and gets back indexes
 * to remove.
 */

/**
 * Normalizes a PDF `/Rect` (`[x1, y1, x2, y2]`, corners in any order) into an
 * `{x, y, width, height}` box in the same bottom-left-origin user space.
 *
 * @param {[number, number, number, number]} rect
 * @returns {{x: number, y: number, width: number, height: number}}
 */
function normalizeRect([x1, y1, x2, y2]) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** Area of the overlap between two `{x, y, width, height}` boxes, or 0 when they don't touch. */
function overlapArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/**
 * Indexes of `linkRects` that sit over a deleted object closely enough to be
 * dropped along with it: at least half of the link's own area overlaps some
 * one deleted box. A degenerate (zero-area) link rect is never reported,
 * since "half of nothing" would match anything under it.
 *
 * @param {Array<[number, number, number, number]>} linkRects PDF `/Rect` arrays
 * @param {Array<{x: number, y: number, width: number, height: number}>} deletedBoxes
 *   deleted objects' bounding boxes, same user space as `linkRects`
 * @returns {number[]} indexes into `linkRects` to drop
 */
export function linksOverDeleted(linkRects, deletedBoxes) {
  const dropped = [];

  linkRects.forEach((rect, index) => {
    const link = normalizeRect(rect);
    const linkArea = link.width * link.height;
    if (linkArea <= 0) return;

    const coveredByAny = deletedBoxes.some((box) => overlapArea(link, box) >= linkArea / 2);
    if (coveredByAny) dropped.push(index);
  });

  return dropped;
}

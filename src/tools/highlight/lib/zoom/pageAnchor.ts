interface Box { left: number; top: number; width: number; height: number }
interface Point { x: number; y: number }
export interface PageAnchor { pageIndex: number; fx: number; fy: number }

/** The page under `point` (else the nearest by vertical distance) and where in it, as fractions of its box. */
export function pageAnchorAt(pageRects: Box[], point: Point): PageAnchor | null {
  let best = -1;
  let bestDistance = Infinity;
  pageRects.forEach((r, i) => {
    const distance = point.y < r.top ? r.top - point.y : point.y > r.top + r.height ? point.y - (r.top + r.height) : 0;
    if (distance < bestDistance) { best = i; bestDistance = distance; }
  });
  if (best < 0) return null;
  const r = pageRects[best];
  return { pageIndex: best, fx: (point.x - r.left) / r.width, fy: (point.y - r.top) / r.height };
}

/** The scroll change that puts the anchored page fraction back under `point` once the page has its new box. */
export function scrollDelta(anchor: { fx: number; fy: number }, pageRectAfter: Box, point: Point): { dx: number; dy: number } {
  return {
    dx: pageRectAfter.left + anchor.fx * pageRectAfter.width - point.x,
    dy: pageRectAfter.top + anchor.fy * pageRectAfter.height - point.y,
  };
}

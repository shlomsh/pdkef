import type { HighlightBand } from '#editor/model/editorModel.ts';

/** A point in percent of the mark's box. */
export type PanelAnchor = { x: number; y: number };

/** The click's x, and the top of the line it landed on (the nearest line when it landed between). @testSeam */
export function panelAnchor(bands: readonly HighlightBand[], point: PanelAnchor): PanelAnchor {
  let best: HighlightBand | null = null;
  let bestDist = Infinity;
  for (const b of bands) {
    const dist = point.y < b.top ? b.top - point.y : point.y > b.top + b.height ? point.y - (b.top + b.height) : 0;
    if (dist < bestDist) { best = b; bestDist = dist; }
  }
  return { x: point.x, y: best ? best.top : 0 };
}

/** READ-24: where a click on a mark opens its row, read against the mark's box on screen so any zoom gives the same answer. None for a box with no size. */
export function clickAnchor(box: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, bands: readonly HighlightBand[], click: { clientX: number; clientY: number }): PanelAnchor | null {
  if (!box.width || !box.height) return null;
  return panelAnchor(bands, { x: ((click.clientX - box.left) / box.width) * 100, y: ((click.clientY - box.top) / box.height) * 100 });
}

import type { HighlightBand } from '#editor/model/editorModel.ts';

/**
 * Where the row stands on a mark, in percent of the mark's box: `x`, the line's `y` and `bottom`, and `pull`, the percent
 * of its own width the anchor steps back along x (a click centres the row on `x`, a focus lines it up with the mark's start).
 */
export type PanelAnchor = { x: number; y: number; bottom: number; pull: number };

/** The row above the line, or below it. */
export type RowSide = 'top' | 'bottom';

/** The gap between the row and its line, in px. */
export const ROW_GAP = 8;

/** Room for the tallest menu (Look) and its gap, in px. A menu may rise over the bar; it may not leave the screen. */
const MENU_ROOM = 190;

/** The click's x, and the line it landed on (the nearest line when it landed between). @testSeam */
export function panelAnchor(bands: readonly HighlightBand[], point: { x: number; y: number }): PanelAnchor {
  let best: HighlightBand | null = null;
  let bestDist = Infinity;
  for (const b of bands) {
    const dist = point.y < b.top ? b.top - point.y : point.y > b.top + b.height ? point.y - (b.top + b.height) : 0;
    if (dist < bestDist) { best = b; bestDist = dist; }
  }
  return { x: point.x, y: best ? best.top : 0, bottom: best ? best.top + best.height : 100, pull: -50 };
}

/** READ-24: where a click on a mark opens its row, read against the mark's box on screen so any zoom gives the same answer. None for a box with no size. */
export function clickAnchor(box: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, bands: readonly HighlightBand[], click: { clientX: number; clientY: number }): PanelAnchor | null {
  if (!box.width || !box.height) return null;
  return panelAnchor(bands, { x: ((click.clientX - box.left) / box.width) * 100, y: ((click.clientY - box.top) / box.height) * 100 });
}

/** Keyboard focus opens the row on the whole mark, at its start edge. */
export function focusAnchor(rtl: boolean): PanelAnchor {
  return rtl ? { x: 100, y: 0, bottom: 100, pull: -100 } : { x: 0, y: 0, bottom: 100, pull: 0 };
}

/** READ-24: the row sits above the line when it clears the bar (`ceiling`) and its menu has room above it; else below, so neither lands on the mark. */
export function rowSide(lineTop: number, rowHeight: number, ceiling: number): RowSide {
  return lineTop - ROW_GAP - rowHeight >= Math.max(ceiling, MENU_ROOM) ? 'top' : 'bottom';
}

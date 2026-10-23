/* MERGE-24: on desktop the page cells grow to fill the stage instead of a
   fixed 104px. Pure arithmetic only; useStageFit.ts does the DOM measuring. */

/* One grid item the pages occupy: 1 column per portrait page, 2 per landscape
   or rotated page; `breakBefore` for a page that starts a fresh row (the first
   page of a run under a full-width caption). */
export interface FitItem {
  span: 1 | 2;
  breakBefore: boolean;
}

export interface StageFitInput {
  items: FitItem[];
  /** The grid's content width, px. */
  width: number;
  /** Px from the grid's content top to the card's first-screen floor. */
  height: number;
  gap: number;
  /** Px under each thumbnail: the cell's flex gap plus the page number line. */
  labelHeight: number;
  /** Thumbnail width / height. */
  ratio: number;
  min: number;
  max: number;
}

/* Rows the items fill, packed the way the grid auto-places them: in order, a
   span-2 item that does not fit the rest of a row starts a new one (leaving a
   hole), and `breakBefore` always does. A span-2 item in a 1-column grid takes
   one row. */
export function rowsFor(items: FitItem[], columns: number): number {
  let rows = 0;
  let used = columns;
  for (const { span, breakBefore } of items) {
    const width = Math.min(span, columns);
    if (breakBefore || used + width > columns) {
      rows += 1;
      used = 0;
    }
    used += width;
  }
  return rows;
}

/* The widest cell (capped at `max`) whose rows all fit above the floor. Tries
   one column count at a time, fewest columns first, so the first fit is the
   biggest; a set too big for even `min` keeps `min` and scrolls. */
export function fitCellWidth({ items, width, height, gap, labelHeight, ratio, min, max }: StageFitInput): number {
  if (width <= 0 || height <= 0) return min;
  const units = items.reduce((sum, item) => sum + item.span, 0);
  for (let columns = 1; columns <= units; columns += 1) {
    const cell = Math.min(max, (width - (columns - 1) * gap) / columns);
    if (cell < min) break;
    const rows = rowsFor(items, columns);
    if (rows * (cell / ratio + labelHeight) + (rows - 1) * gap <= height) return Math.floor(cell);
  }
  return min;
}

const RASTER_STEPS = [150, 240, 320, 400, 480];

/* The smallest raster step that stays sharp at this cell width and screen
   density (density capped at 2). Steps, not exact widths, so a cell growing a
   few pixels never re-renders a page. At the floor cell the raster stays at the
   first step whatever the density, as before the fit; larger steps only apply
   once the cell is bigger, which only happens with few pages. */
export function rasterWidthFor(cellWidth: number, devicePixelRatio: number, floorCell = 104): number {
  if (cellWidth <= floorCell) return RASTER_STEPS[0];
  const target = cellWidth * Math.min(devicePixelRatio, 2);
  return RASTER_STEPS.find((step) => step >= target) ?? RASTER_STEPS[RASTER_STEPS.length - 1];
}

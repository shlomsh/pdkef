/* MERGE-24: on desktop the page cells grow to fill the stage instead of a
   fixed 104px. Pure arithmetic only; useStageFit.ts does the DOM measuring. */

export interface StageFitInput {
  /** Grid columns the pages occupy: 1 per portrait page, 2 per landscape or rotated page. */
  units: number;
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

/* The widest cell (capped at `max`) whose rows all fit above the floor. Tries
   one column count at a time, fewest columns first, so the first fit is the
   biggest; a set too big for even `min` keeps `min` and scrolls. */
export function fitCellWidth({ units, width, height, gap, labelHeight, ratio, min, max }: StageFitInput): number {
  if (width <= 0 || height <= 0) return min;
  for (let columns = 1; columns <= units; columns += 1) {
    const cell = Math.min(max, (width - (columns - 1) * gap) / columns);
    if (cell < min) break;
    const rows = Math.ceil(units / columns);
    if (rows * (cell / ratio + labelHeight) + (rows - 1) * gap <= height) return Math.floor(cell);
  }
  return min;
}

const RASTER_STEPS = [150, 240, 320, 400, 480];

/* The smallest raster step that stays sharp at this cell width and screen
   density (density capped at 2). Steps, not exact widths, so a cell growing a
   few pixels never re-renders a page. */
export function rasterWidthFor(cellWidth: number, devicePixelRatio: number): number {
  const target = cellWidth * Math.min(devicePixelRatio, 2);
  return RASTER_STEPS.find((step) => step >= target) ?? RASTER_STEPS[RASTER_STEPS.length - 1];
}

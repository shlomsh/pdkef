interface FitGrid {
  count: number;
  /** The grid's inner box. */
  width: number;
  height: number;
  gap: number;
  /** A tile's height beyond its square: the caption line and the gap above it. */
  caption: number;
  /** The smallest and largest square a tile may be. */
  min: number;
  max: number;
}

/**
 * COMP-04: how many columns draw a set of square tiles as large as they may be while the whole set still
 * fits the box. When no size fits, the most columns the smallest tile allows, and the grid scrolls.
 */
export function fitGridColumns({ count, width, height, gap, caption, min, max }: FitGrid): number {
  const most = Math.max(1, Math.floor((width + gap) / (min + gap)));
  let best = most;
  for (let columns = most; columns >= 1; columns--) {
    const size = (width - gap * (columns - 1)) / columns;
    if (size > max) break;
    const rows = Math.ceil(count / columns);
    if (rows * (size + caption) + gap * (rows - 1) > height) break;
    best = columns;
  }
  return best;
}

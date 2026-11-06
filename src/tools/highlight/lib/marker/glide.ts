/** @testSeam */
export const GLIDE_GAP = 8;

/** How far the page moves down so a mark at markTop clears what covers it down to coverBottom. */
export const glideFor = (markTop: number, coverBottom: number): number =>
  Math.max(0, Math.ceil(coverBottom + GLIDE_GAP - markTop));

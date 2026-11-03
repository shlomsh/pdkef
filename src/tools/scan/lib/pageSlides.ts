/** Which slide a horizontal scroller shows: rounded, by the absolute scroll (RTL scrolls negative), kept inside the pages. */
export function slideIndexAt(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0 || count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(Math.abs(scrollLeft) / slideWidth)));
}

/** The slides that load their image: the current one and its two neighbours, inclusive and inside the pages. */
export function slideWindow(index: number, count: number): { from: number; to: number } {
  return { from: Math.max(0, index - 1), to: Math.min(Math.max(0, count - 1), index + 1) };
}

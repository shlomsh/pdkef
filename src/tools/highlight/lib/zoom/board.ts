interface BoardLayout { slack: number; boardWidth: number }

/**
 * The column (the pages, with their notes) sits on a board that is only as wide as it needs to be: a column
 * narrower than the view is centred with equal slack each side and has nothing to scroll; a wider one has no
 * slack and can be moved only until its edge meets the view's. `inset` is the workspace's own padding, which
 * the view's room is measured inside. Vertically the board is the column: it scrolls from the document's top
 * to its bottom.
 */
export function boardLayout(columnWidth: number, viewWidth: number, inset = 0): BoardLayout {
  const slack = Math.max(0, (viewWidth - 2 * inset - columnWidth) / 2);
  return { slack, boardWidth: columnWidth + 2 * slack };
}

/**
 * The scrollLeft that puts the page, or a span `focus` inside it (px from the column's left edge), in the middle of
 * the view. `inset` is the workspace's own padding, which the board starts after.
 */
export function centredScrollLeft(
  layout: BoardLayout,
  columnWidth: number,
  viewWidth: number,
  focus?: { left: number; right: number },
  inset = 0,
): number {
  const middle = focus ? (focus.left + focus.right) / 2 : columnWidth / 2;
  return inset + layout.slack + middle - viewWidth / 2;
}

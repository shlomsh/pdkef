interface BoardLayout { slack: number; boardWidth: number }

/**
 * The column (the pages, with their notes) sits on a board with one view of room each side, so it can be moved
 * and zoomed sideways freely. Vertically the board is the column: it scrolls from the document's top to its bottom.
 */
export function boardLayout(columnWidth: number, viewWidth: number): BoardLayout {
  return { slack: viewWidth, boardWidth: columnWidth + 2 * viewWidth };
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

interface BoardLayout { slack: number; boardWidth: number; /** View heights of room above and below the column, so a short zoomed-out document is not clamped to the top. */ slackY: number }

/**
 * The column (the pages, with their notes) sits on a board with one view of room each side, and one view height
 * above and below when `viewHeight` is given, so it can be moved and zoomed freely.
 */
export function boardLayout(columnWidth: number, viewWidth: number, viewHeight = 0): BoardLayout {
  return { slack: viewWidth, boardWidth: columnWidth + 2 * viewWidth, slackY: viewHeight };
}

/** The scrollTop that puts the column's top at the top of the view, as it sat before the board had vertical room. */
export function columnTopScrollTop(layout: BoardLayout): number {
  return layout.slackY;
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

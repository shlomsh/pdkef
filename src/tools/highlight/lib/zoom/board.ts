interface BoardLayout { slack: number; boardWidth: number }

/** The page sits on a board with one view of room each side, so it can be moved and zoomed into freely. */
export function boardLayout(pageWidth: number, viewWidth: number): BoardLayout {
  return { slack: viewWidth, boardWidth: pageWidth + 2 * viewWidth };
}

/** The scrollLeft that puts the page, or a span `focus` inside it (px from its left edge), in the middle of the view. */
export function centredScrollLeft(
  layout: BoardLayout,
  pageWidth: number,
  viewWidth: number,
  focus?: { left: number; right: number },
): number {
  const middle = focus ? (focus.left + focus.right) / 2 : pageWidth / 2;
  return layout.slack + middle - viewWidth / 2;
}

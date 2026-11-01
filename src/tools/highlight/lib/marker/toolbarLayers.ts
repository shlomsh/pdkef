const SCROLL_CLOSE_PX = 24;

/** R9: a scroll of more than 24 px closes the toolbar. */
export const scrolledPast = (startY: number, nowY: number): boolean => Math.abs(nowY - startY) > SCROLL_CLOSE_PX;

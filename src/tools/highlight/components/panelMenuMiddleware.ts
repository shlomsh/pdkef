import { flip, offset, shift } from '@floating-ui/react';

/**
 * The row's menus stay above or below it. A menu too wide to centre on a button near the screen's edge slides along the
 * row and lines up with its end; the shared popover's flip would swing it round to the button's side, over the row.
 */
export const PANEL_MENU_MIDDLEWARE = [offset(10), flip({ crossAxis: false }), shift({ padding: 16 })];

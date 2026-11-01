export interface MenuPlacementInput {
  triggerLeft: number;
  triggerRight: number;
  menuWidth: number;
  viewportWidth: number;
  rtl: boolean;
  margin?: number;
}

/** The menu's left edge in px: its start edge on the trigger's start edge, kept `margin` px inside the viewport. */
export function menuLeft({ triggerLeft, triggerRight, menuWidth, viewportWidth, rtl, margin = 8 }: MenuPlacementInput): number {
  const start = rtl ? triggerRight - menuWidth : triggerLeft;
  const max = viewportWidth - menuWidth - margin;
  return Math.max(margin, Math.min(start, max));
}

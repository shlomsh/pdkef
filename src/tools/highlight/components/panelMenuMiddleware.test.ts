import { computePosition } from '@floating-ui/react';
import { describe, expect, it } from 'vitest';
import { PANEL_MENU_MIDDLEWARE } from './panelMenuMiddleware.ts';

// Floating UI's own arithmetic on plain rects: the phone's screen, Look at the row's right end, and its menu.
const screen = { x: 0, y: 0, width: 402, height: 874 };
const platform = {
  getElementRects: ({ reference, floating }: any) => ({ reference, floating: { x: 0, y: 0, ...floating } }),
  getDimensions: (element: any) => element,
  getClippingRect: () => screen,
  convertOffsetParentRelativeRectToViewportRelativeRect: ({ rect }: any) => rect,
  getOffsetParent: () => null,
  getDocumentElement: () => null,
  isElement: () => false,
  isRTL: () => false,
};
const place = (reference: object, floating: object, placement: 'top' | 'bottom') =>
  computePosition(reference as any, floating as any, { placement, middleware: PANEL_MENU_MIDDLEWARE, platform: platform as any });

describe('PANEL_MENU_MIDDLEWARE', () => {
  const look = { x: 279, y: 216, width: 66, height: 44 };
  const menu = { width: 240, height: 194 };

  it('a menu too wide to centre under a button near the edge stays under the row and slides along it', async () => {
    const at = await place(look, menu, 'bottom');
    expect(at.placement).toBe('bottom');
    expect(at.y).toBe(270);
    expect(at.x + menu.width).toBe(386);
  });

  it('a menu with no room on its own side goes to the other side of the row, never round its end', async () => {
    const at = await place({ ...look, y: 100 }, menu, 'top');
    expect(at.placement).toBe('bottom');
  });
});

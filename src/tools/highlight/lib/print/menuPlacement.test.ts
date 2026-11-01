import { describe, expect, it } from 'vitest';
import { menuLeft } from './menuPlacement.ts';

const base = { triggerLeft: 300, triggerRight: 340, menuWidth: 192, viewportWidth: 1280, rtl: false };

describe('menuLeft', () => {
  it('aligns the menu start edge with the trigger left edge in LTR', () => {
    expect(menuLeft(base)).toBe(300);
  });
  it('aligns the menu start edge with the trigger right edge in RTL', () => {
    expect(menuLeft({ ...base, rtl: true })).toBe(340 - 192);
  });
  it('keeps the menu 8 px inside the right edge', () => {
    expect(menuLeft({ ...base, triggerLeft: 1200 })).toBe(1280 - 192 - 8);
  });
  it('keeps the menu 8 px inside the left edge', () => {
    expect(menuLeft({ ...base, triggerLeft: 2, triggerRight: 40, rtl: true })).toBe(8);
  });
  it('returns the margin when the menu is wider than the viewport', () => {
    expect(menuLeft({ ...base, menuWidth: 400, viewportWidth: 300 })).toBe(8);
  });
});

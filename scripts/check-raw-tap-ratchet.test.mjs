import { describe, expect, it } from 'vitest';
import { compareRawTaps, countRawTaps } from './check-raw-tap-ratchet.mjs';

describe('countRawTaps', () => {
  it('counts raw taps per spec file', () => {
    const r = countRawTaps({
      'src/a.spec.js': 'await page.touchscreen.tap(1, 2);\nawait page.touchscreen.tap(3, 4);\n',
      'src/b.spec.js': 'await tapOnce(page, { x: 1, y: 2 });\n',
    });
    expect(r).toEqual({ total: 2, files: { 'src/a.spec.js': 2 } });
  });
  it('ignores the helper under e2e/support/', () => {
    expect(countRawTaps({ 'e2e/support/touch.js': 'await page.touchscreen.tap(x, y);' }).total).toBe(0);
  });
});

describe('compareRawTaps', () => {
  it('fails on more, flags fewer, passes on equal', () => {
    expect(compareRawTaps(0, 1)).toEqual({ failed: true, lowered: false });
    expect(compareRawTaps(2, 1)).toEqual({ failed: false, lowered: true });
    expect(compareRawTaps(1, 1)).toEqual({ failed: false, lowered: false });
  });
});

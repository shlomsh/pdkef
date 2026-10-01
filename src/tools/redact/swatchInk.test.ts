import { describe, expect, it } from 'vitest';
import { swatchInk } from './swatchInk.ts';

describe('swatchInk', () => {
  it('gives dark ink on light swatches', () => {
    for (const hex of ['#ffffff', '#f7f1de', '#ffcc00']) expect(swatchInk(hex)).toBe('dark');
  });
  it('gives light ink on dark swatches', () => {
    for (const hex of ['#000000', '#1463ff']) expect(swatchInk(hex)).toBe('light');
  });
  it('falls back to dark for anything unparseable', () => {
    expect(swatchInk('nope')).toBe('dark');
  });
});

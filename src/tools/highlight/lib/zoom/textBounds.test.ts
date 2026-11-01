import { describe, expect, it } from 'vitest';
import { textBounds } from './textBounds.ts';

const item = (x: number, width: number, str = 'word') => ({ str, width, transform: [10, 0, 0, 10, x, 700] });

describe('textBounds', () => {
  it('spans the leftmost to the rightmost text item', () => {
    expect(textBounds([item(80, 100), item(60, 40), item(300, 150)], 612)).toEqual({ textLeft: 60, textRight: 450 });
  });
  it('falls back to the whole page without text', () => {
    expect(textBounds([], 612)).toEqual({ textLeft: 0, textRight: 612 });
    expect(textBounds([item(10, 20, '  ')], 612)).toEqual({ textLeft: 0, textRight: 612 });
  });
  it('clips to the page', () => {
    expect(textBounds([item(-5, 900)], 612)).toEqual({ textLeft: 0, textRight: 612 });
  });
});

import { describe, expect, it } from 'vitest';
import { buildPageText } from './pageText.ts';
import type { TextItemLike } from './types.ts';

function item(str: string, transform: number[], width: number, height = 12, extra: Partial<TextItemLike> = {}): TextItemLike {
  return { str, transform, width, height, ...extra };
}

describe('buildPageText', () => {
  it('skips items with no string or blank string', () => {
    const page = buildPageText(0, [
      item('', [1, 0, 0, 1, 0, 700], 0),
      item('   ', [1, 0, 0, 1, 0, 700], 10),
      item('hello', [1, 0, 0, 1, 0, 700], 30),
    ]);
    expect(page.text).toBe('hello');
    expect(page.items).toHaveLength(1);
  });

  it('joins two items on a line with a space when there is a visible gap', () => {
    const page = buildPageText(0, [
      item('Hello', [1, 0, 0, 1, 0, 700], 30),
      item('World', [1, 0, 0, 1, 40, 700], 30),
    ]);
    expect(page.text).toBe('Hello World');
    expect(page.items[0]).toMatchObject({ start: 0, end: 5 });
    expect(page.items[1]).toMatchObject({ start: 6, end: 11 });
  });

  it('joins with no added separator when a side already has whitespace at the joint', () => {
    const page = buildPageText(0, [
      item('Hello ', [1, 0, 0, 1, 0, 700], 40, 12),
      item('World', [1, 0, 0, 1, 40, 700], 30, 12),
    ]);
    expect(page.text).toBe('Hello World');
  });

  it('keeps touching runs as one word, with no space between them', () => {
    const page = buildPageText(0, [
      item('Jo', [1, 0, 0, 1, 0, 700], 12, 12),
      item('hn', [1, 0, 0, 1, 12, 700], 12, 12),
    ]);
    expect(page.text).toBe('John');
  });

  it('reads visual LTR order even when items arrive out of stream order', () => {
    const page = buildPageText(0, [
      item('World', [1, 0, 0, 1, 40, 700], 30),
      item('Hello', [1, 0, 0, 1, 0, 700], 30),
    ]);
    expect(page.text).toBe('Hello World');
  });

  it('reads a Hebrew line right to left when items arrive left to right on the page', () => {
    // Hebrew "שלום עולם": placed left-to-right on the page (first item at the
    // left, x=0; second item further right, x=40), but visual reading order
    // is right to left, so the rightmost item ("עולם") reads first.
    const page = buildPageText(0, [
      item('שלום', [1, 0, 0, 1, 0, 700], 30),
      item('עולם', [1, 0, 0, 1, 40, 700], 30),
    ]);
    expect(page.text).toBe('עולם שלום');
  });

  it('breaks a line between two baselines', () => {
    const page = buildPageText(0, [
      item('First', [1, 0, 0, 1, 0, 700], 30, 12),
      item('Second', [1, 0, 0, 1, 0, 680], 30, 12),
    ]);
    expect(page.text).toBe('First\nSecond');
  });

  it('keeps a rotated item as its own line, after upright lines', () => {
    const page = buildPageText(0, [
      item('Upright', [1, 0, 0, 1, 0, 700], 40, 12),
      item('Rotated', [0, 1, -1, 0, 100, 600], 40, 12),
    ]);
    expect(page.text).toBe('Upright\nRotated');
    expect(page.items[1].transform).toEqual([0, 1, -1, 0, 100, 600]);
  });

  it('marks an item rtl by dir, falling back to script when dir is absent', () => {
    const page = buildPageText(0, [
      item('Hello', [1, 0, 0, 1, 0, 700], 30, 12, { dir: 'rtl' }),
      item('World', [1, 0, 0, 1, 40, 700], 30, 12),
    ]);
    expect(page.items[0].rtl).toBe(true);
    expect(page.items[1].rtl).toBe(false);
  });

  describe('text drawn twice for a bold look (RED-62)', () => {
    it('reads an item drawn twice with a tiny offset once', () => {
      const page = buildPageText(0, [
        item('Hello', [1, 0, 0, 1, 0, 700], 30),
        item('Hello', [1, 0, 0, 1, 0.4, 700.3], 30),
      ]);
      expect(page.text).toBe('Hello');
      expect(page.items).toHaveLength(1);
    });

    it('keeps a genuine repeat a word apart', () => {
      const page = buildPageText(0, [
        item('Hello', [1, 0, 0, 1, 0, 700], 30),
        item('Hello', [1, 0, 0, 1, 40, 700], 30),
      ]);
      expect(page.text).toBe('Hello Hello');
    });

    it('reads an item drawn three times in small steps once', () => {
      const page = buildPageText(0, [
        item('Hello', [1, 0, 0, 1, 0, 700], 30),
        item('Hello', [1, 0, 0, 1, 1.2, 700], 30),
        item('Hello', [1, 0, 0, 1, 2.4, 700], 30),
      ]);
      expect(page.text).toBe('Hello');
      expect(page.items).toHaveLength(1);
    });

    it('does not compare every item with every other on a big page', () => {
      const many = Array.from({ length: 30000 }, (_, i) =>
        item(`w${i}`, [1, 0, 0, 1, (i % 60) * 10, 800 - Math.floor(i / 60) * 10], 30, 10),
      );
      const original = String.prototype.trim;
      let calls = 0;
      String.prototype.trim = function (this: string) {
        calls += 1;
        if (calls > 100000) throw new Error('trim called more than 100000 times');
        return original.call(this);
      };
      try {
        expect(buildPageText(0, many).items).toHaveLength(30000);
      } finally {
        String.prototype.trim = original;
      }
      expect(calls).toBeLessThan(100000);
    });

    it('reads a Hebrew item drawn twice once', () => {
      const page = buildPageText(0, [
        item('כרטיס', [1, 0, 0, 1, 100, 700], 30, 12, { dir: 'rtl' }),
        item('כרטיס', [1, 0, 0, 1, 100.5, 700], 30, 12, { dir: 'rtl' }),
      ]);
      expect(page.text).toBe('כרטיס');
    });
  });
});

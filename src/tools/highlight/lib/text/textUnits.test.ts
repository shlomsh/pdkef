import { describe, expect, it } from 'vitest';
import type { PageTextItem } from '#lib/pdf/pdfTextItems.ts';
import { sentenceBoxes, wordBoxes } from './textUnits.ts';

/** One item, 1 percent wide per character, 2 percent tall. */
function item(str: string, left: number, top: number, width = str.length): PageTextItem {
  return { str, left, top, width, height: 2 };
}

describe('wordBoxes, English', () => {
  const line = [item('The quick br', 10, 10), item('own fox jumps', 22, 10)];

  it('boxes a word in the middle of an item', () => {
    const boxes = wordBoxes(line, { x: 14.5, y: 11 }, 'en');
    expect(boxes).toHaveLength(1);
    expect(boxes![0].left).toBeCloseTo(14);
    expect(boxes![0].width).toBeCloseTo(5);
    expect(boxes![0].top).toBeCloseTo(10);
    expect(boxes![0].height).toBeCloseTo(2);
  });

  it('boxes a word that spans two items as one box', () => {
    const boxes = wordBoxes(line, { x: 21.5, y: 11 }, 'en');
    expect(boxes).toHaveLength(1);
    expect(boxes![0].left).toBeCloseTo(20);
    expect(boxes![0].width).toBeCloseTo(5);
  });

  it('joins items with a space when the gap is wider than a quarter of the line height', () => {
    const apart = [item('foo', 10, 10), item('bar', 14, 10)];
    const foo = wordBoxes(apart, { x: 11, y: 11 }, 'en');
    expect(foo![0].left).toBeCloseTo(10);
    expect(foo![0].width).toBeCloseTo(3);
  });

  it('does not box punctuation or a point off the text', () => {
    expect(wordBoxes(line, { x: 11, y: 30 }, 'en')).toBeNull();
    expect(wordBoxes(line, { x: 5, y: 11 }, 'en')).toBeNull();
    expect(wordBoxes([item('foo', 10, 10), item('bar', 14, 10)], { x: 13.5, y: 11 }, 'en')).toBeNull();
  });
});

describe('sentenceBoxes, English', () => {
  const lines = [item('Hello there. This is a', 10, 10), item('long sentence. Bye', 10, 12.4)];

  it('gives one box per line the sentence covers, ending at a period mid-line', () => {
    const boxes = sentenceBoxes(lines, { x: 14, y: 13 }, 'en');
    expect(boxes).toHaveLength(2);
    expect(boxes![0].left).toBeCloseTo(23);
    expect(boxes![0].width).toBeCloseTo(9);
    expect(boxes![0].top).toBeCloseTo(10);
    expect(boxes![1].left).toBeCloseTo(10);
    expect(boxes![1].width).toBeCloseTo(14);
    expect(boxes![1].top).toBeCloseTo(12.4);
  });

  it('gives a single box for a sentence inside one line', () => {
    const boxes = sentenceBoxes(lines, { x: 12, y: 11 }, 'en');
    expect(boxes).toHaveLength(1);
    expect(boxes![0].left).toBeCloseTo(10);
    expect(boxes![0].width).toBeCloseTo(12);
  });

  it('does not join lines that are far apart', () => {
    const apart = [item('Hello there. This is a', 10, 10), item('long sentence. Bye', 10, 20)];
    const boxes = sentenceBoxes(apart, { x: 25, y: 11 }, 'en');
    expect(boxes).toHaveLength(1);
    expect(boxes![0].left).toBeCloseTo(23);
  });

  it('is null off any text', () => {
    expect(sentenceBoxes(lines, { x: 14, y: 30 }, 'en')).toBeNull();
  });
});

describe('Hebrew, right to left', () => {
  it('boxes the word under the point', () => {
    const a = item('שלום עולם', 71, 10);
    const b = item('זה טוב.', 62, 10);
    const boxes = wordBoxes([a, b], { x: 73, y: 11 }, 'he');
    expect(boxes).toHaveLength(1);
    expect(boxes![0].left).toBeCloseTo(71);
    expect(boxes![0].width).toBeCloseTo(4);
  });

  it('runs a sentence right to left across lines', () => {
    const first = 'הוא אמר שלום. זה ארוך';
    const second = 'מאוד ויפה. סוף';
    const lines = [item(first, 80 - first.length, 10), item(second, 80 - second.length, 12.4)];
    const start = first.indexOf('זה');
    const end = 'מאוד ויפה.'.length;
    const boxes = sentenceBoxes(lines, { x: 80 - first.indexOf('ארוך') - 1, y: 11 }, 'he');
    expect(boxes).toHaveLength(2);
    expect(boxes![0].left).toBeCloseTo(80 - first.length);
    expect(boxes![0].left + boxes![0].width).toBeCloseTo(80 - start);
    expect(boxes![1].left).toBeCloseTo(80 - end);
    expect(boxes![1].left + boxes![1].width).toBeCloseTo(80);
  });

  it('is null off any text', () => {
    expect(wordBoxes([item('שלום', 70, 10)], { x: 20, y: 11 }, 'he')).toBeNull();
    expect(sentenceBoxes([item('שלום', 70, 10)], { x: 20, y: 11 }, 'he')).toBeNull();
  });
});

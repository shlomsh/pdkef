import { describe, expect, it } from 'vitest';
import type { EditorElement } from '../../../editor/model/editorModel.ts';
import { ensureMinimumElementSize } from './minimumSize.ts';

const ctx = (tool: string, extra = {}) => ({
  tool,
  rectWidth: 800,
  rectHeight: 1000,
  startLeftPercent: 40,
  startTopPercent: 30,
  ...extra,
});
const el = (value: object) => value as unknown as EditorElement;

describe('ensureMinimumElementSize: lines', () => {
  it('keeps a line that is long enough', () => {
    const line = el({ type: 'line', x1: 10, y1: 10, x2: 30, y2: 10 });
    expect(ensureMinimumElementSize(line, ctx('line'))).toBe(line);
  });

  it('resets a tiny line to a horizontal stroke around the start point', () => {
    const line = el({ id: 'l', type: 'line', x1: 40, y1: 30, x2: 40.2, y2: 30.2 });
    expect(ensureMinimumElementSize(line, ctx('line'))).toEqual({ ...line, x1: 34, y1: 30, x2: 46, y2: 30 });
  });

  it('clamps the reset line to the page edges', () => {
    const line = el({ type: 'line', x1: 2, y1: 5, x2: 2, y2: 5 });
    const out = ensureMinimumElementSize(line, ctx('line', { startLeftPercent: 2, startTopPercent: 5 })) as any;
    expect(out.x1).toBe(0);
    const right = ensureMinimumElementSize(line, ctx('line', { startLeftPercent: 98 })) as any;
    expect(right.x2).toBe(100);
  });

  it('returns a non-line element untouched when the tool is line', () => {
    const box = el({ type: 'rect', left: 1, top: 1, width: 0.1, height: 0.1 });
    expect(ensureMinimumElementSize(box, ctx('line'))).toBe(box);
  });
});

describe('ensureMinimumElementSize: boxes', () => {
  it('keeps a box when either side reaches the threshold', () => {
    const wide = el({ type: 'rect', left: 1, top: 1, width: 0.5, height: 0.1 });
    const tall = el({ type: 'rect', left: 1, top: 1, width: 0.1, height: 0.5 });
    expect(ensureMinimumElementSize(wide, ctx('shape'))).toBe(wide);
    expect(ensureMinimumElementSize(tall, ctx('shape'))).toBe(tall);
  });

  it('returns an element without width and height untouched', () => {
    const text = el({ type: 'text', left: 1, top: 1, text: 'x' });
    expect(ensureMinimumElementSize(text, ctx('text'))).toBe(text);
  });

  it('gives a tiny whiteout the default size around the click', () => {
    const box = el({ id: 'w', type: 'whiteout', left: 40, top: 30, width: 0.1, height: 0.1 });
    expect(ensureMinimumElementSize(box, ctx('whiteout'))).toEqual({ ...box, left: 35, top: 28, width: 10, height: 4 });
  });

  it('gives any other tiny box a click-centred square, scaled by the page aspect', () => {
    const box = el({ id: 's', type: 'rect', left: 40, top: 30, width: 0.1, height: 0.1 });
    // height% = 8 * 1 * (800 / 1000) = 6.4
    const out = ensureMinimumElementSize(box, ctx('shape')) as any;
    expect(out.width).toBe(8);
    expect(out.height).toBeCloseTo(6.4);
    expect(out.left).toBe(36);
    expect(out.top).toBeCloseTo(26.8);
  });
});

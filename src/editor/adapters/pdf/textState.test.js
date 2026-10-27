import { describe, it, expect } from 'vitest';
import {
  initialTextState,
  applyTextStateOperator,
  beginText,
  moveToNextLine,
  advanceText,
  setQuoteSpacing,
  glyphAdvance,
  kernShift,
} from './textState.js';

const n = (value) => ({ type: 'number', value });
const name = (value) => ({ type: 'name', value });
const apply = (state, op, ...operands) => applyTextStateOperator(state, op, operands, new Map([['/F1', { id: 'f1' }]]));

describe('applyTextStateOperator', () => {
  it('Tf selects the font and size, and a non-name operand clears the font', () => {
    const next = apply(initialTextState(), 'Tf', name('F1'), n(12));
    expect(next).toMatchObject({ fontKey: '/F1', font: { id: 'f1' }, fontSize: 12 });
    expect(apply(next, 'Tf', n(1), n(9))).toMatchObject({ fontKey: null, font: null, fontSize: 9 });
    expect(apply(next, 'Tf', name('Nope'), n(9))).toMatchObject({ fontKey: '/Nope', font: null });
  });

  it('Tc, Tw, TL and Ts take their last operand', () => {
    const s = initialTextState();
    expect(apply(s, 'Tc', n(1.5)).charSpacing).toBe(1.5);
    expect(apply(s, 'Tw', n(2)).wordSpacing).toBe(2);
    expect(apply(s, 'TL', n(14)).leading).toBe(14);
    expect(apply(s, 'Ts', n(3)).rise).toBe(3);
  });

  it('Tz is a percentage stored as a fraction', () => {
    expect(apply(initialTextState(), 'Tz', n(50)).horizontalScale).toBe(0.5);
  });

  it('Tm sets both matrices', () => {
    const next = apply(initialTextState(), 'Tm', n(1), n(0), n(0), n(1), n(10), n(20));
    expect(next.tm).toEqual([1, 0, 0, 1, 10, 20]);
    expect(next.tlm).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it('Td moves from the line matrix and resets the text matrix to it', () => {
    let s = apply(initialTextState(), 'Tm', n(1), n(0), n(0), n(1), n(10), n(20));
    s = advanceText(s, 5);
    s = apply(s, 'Td', n(3), n(-4));
    expect(s.tlm).toEqual([1, 0, 0, 1, 13, 16]);
    expect(s.tm).toEqual(s.tlm);
  });

  it('TD does what Td does and sets the leading to -ty', () => {
    const s = apply(initialTextState(), 'TD', n(0), n(-12));
    expect(s.leading).toBe(12);
    expect(s.tlm).toEqual([1, 0, 0, 1, 0, -12]);
  });

  it('T* moves down one leading', () => {
    const s = apply(apply(initialTextState(), 'TL', n(10)), 'T*');
    expect(s.tlm).toEqual([1, 0, 0, 1, 0, -10]);
  });

  it('any other operator returns the same state, and nothing is mutated', () => {
    const s = initialTextState();
    expect(apply(s, 'Tj')).toBe(s);
    apply(s, 'Tc', n(9));
    expect(s.charSpacing).toBe(0);
  });
});

describe('text state helpers', () => {
  it('beginText resets the matrices only', () => {
    const s = apply(apply(initialTextState(), 'Tc', n(2)), 'Td', n(5), n(5));
    expect(beginText(s)).toMatchObject({ tm: [1, 0, 0, 1, 0, 0], tlm: [1, 0, 0, 1, 0, 0], charSpacing: 2 });
  });

  it('moveToNextLine and advanceText move the right matrices', () => {
    const s = moveToNextLine({ ...initialTextState(), leading: 7 });
    expect(s.tm).toEqual([1, 0, 0, 1, 0, -7]);
    expect(advanceText(s, 4).tm).toEqual([1, 0, 0, 1, 4, -7]);
    expect(advanceText(s, 4).tlm).toEqual(s.tlm);
  });

  it('setQuoteSpacing reads word then character spacing from the operands', () => {
    const next = setQuoteSpacing(initialTextState(), [n(2), n(3), { type: 'string', value: new Uint8Array() }]);
    expect(next).toMatchObject({ wordSpacing: 2, charSpacing: 3 });
  });
});

describe('glyphAdvance and kernShift', () => {
  const font = { widths: new Map([[65, 600]]), defaultWidth: 500, widthScale: 0.001, twoByte: false };
  const state = { ...initialTextState(), font, fontSize: 10, charSpacing: 1, wordSpacing: 4, horizontalScale: 0.5 };

  it('uses the font width, character spacing and horizontal scale', () => {
    expect(glyphAdvance(state, 65)).toBe((0.6 * 10 + 1) * 0.5);
  });

  it('adds word spacing to a single-byte space only', () => {
    expect(glyphAdvance(state, 32)).toBe((0.5 * 10 + 1 + 4) * 0.5);
    expect(glyphAdvance({ ...state, font: { ...font, twoByte: true } }, 32)).toBe((0.5 * 10 + 1) * 0.5);
  });

  it('falls back to 500 units with no font', () => {
    expect(glyphAdvance({ ...initialTextState(), fontSize: 10 }, 65)).toBe(5);
  });

  it('kernShift moves opposite to the number, scaled by size and Tz', () => {
    expect(kernShift(state, 200)).toBe(-1);
  });
});

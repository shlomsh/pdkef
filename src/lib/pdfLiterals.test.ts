/**
 * Pins `pdfLiterals.ts` to the library it copies. This test is the only reason
 * it is safe to hand pdf-lib values we built ourselves, so it imports the real
 * package deliberately: in node that costs nothing, and the whole point is to
 * compare against the real thing rather than against a fixture of it.
 */
import { describe, expect, it } from 'vitest';
import {
  LineCapStyle,
  StandardFonts,
  degrees as pdfLibDegrees,
  rgb as pdfLibRgb,
} from '@cantoo/pdf-lib';
import { HELVETICA, LINE_CAP_ROUND, degrees, rgb } from './pdfLiterals.ts';

describe('pdfLiterals', () => {
  it('rgb builds the same object pdf-lib builds', () => {
    for (const [r, g, b] of [[0, 0, 0], [1, 1, 1], [0.2, 0.2, 0.2], [0.08, 0.388, 1]]) {
      expect(rgb(r, g, b)).toEqual(pdfLibRgb(r, g, b));
    }
    // pdf-lib branches on `color.type === ColorTypes.RGB` and nothing else.
    expect(rgb(0, 0, 0).type).toBe(pdfLibRgb(0, 0, 0).type);
  });

  it('rgb rejects out-of-range channels, as pdf-lib does', () => {
    for (const bad of [-0.1, 1.1, 255, Number.NaN]) {
      expect(() => rgb(bad, 0, 0)).toThrow();
      expect(() => pdfLibRgb(bad, 0, 0)).toThrow();
    }
  });

  it('degrees builds the same object pdf-lib builds', () => {
    for (const angle of [0, 90, 180, 270, -90, 450]) {
      expect(degrees(angle)).toEqual(pdfLibDegrees(angle));
    }
    expect(degrees(90).type).toBe(pdfLibDegrees(90).type);
  });

  it('degrees rejects a non-number, as pdf-lib does', () => {
    // @ts-expect-error deliberately wrong, to prove the guard matches pdf-lib's
    expect(() => degrees('90')).toThrow();
    // @ts-expect-error deliberately wrong, to prove the guard matches pdf-lib's
    expect(() => pdfLibDegrees('90')).toThrow();
  });

  it('LINE_CAP_ROUND is LineCapStyle.Round', () => {
    expect(LINE_CAP_ROUND).toBe(LineCapStyle.Round);
  });

  it('HELVETICA is StandardFonts.Helvetica', () => {
    expect(HELVETICA).toBe(StandardFonts.Helvetica);
  });
});

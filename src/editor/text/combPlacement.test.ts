import { describe, expect, it } from 'vitest';
import {
  baselineDropEm,
  checkboxRegionAt,
  combFontSize,
  combRegionAt,
  placeCombOnRegion,
  type CombRegion,
  type FieldRegion,
} from './combPlacement.ts';
import { combCellCenterFraction } from './comb.js';

// A4 in PDF points, the size both evidence forms are. Never a 0x0 rect: every
// percentage derived from a zero-sized page is NaN or Infinity, and a geometry
// test that passes against one is proving nothing (CLAUDE.md Part II section 5).
const PAGE_WIDTH = 595.275;
const PAGE_HEIGHT = 841.89;

// The identity comb on income tax form 101, page 1, as the detector reports it.
const IDENTITY_RUN: CombRegion = {
  pageIndex: 0,
  left: 73.597,
  top: 27.277,
  width: 17.152,
  height: 0.836,
  cells: 9,
};

describe('combRegionAt', () => {
  it('finds the run a tap lands in', () => {
    expect(combRegionAt([IDENTITY_RUN], { x: 80, y: 27.6 }, 0)).toBe(IDENTITY_RUN);
  });

  it('accepts a tap above the ink, because the ink is a few points tall', () => {
    // The teeth are 0.84% of the page high - far under a fingertip. The target
    // has to be the strip a person would write in.
    expect(combRegionAt([IDENTITY_RUN], { x: 80, y: 26.4 }, 0)).toBe(IDENTITY_RUN);
  });

  it('rejects a tap outside the run horizontally', () => {
    expect(combRegionAt([IDENTITY_RUN], { x: 60, y: 27.6 }, 0)).toBeNull();
  });

  it('rejects a tap on another page', () => {
    expect(combRegionAt([IDENTITY_RUN], { x: 80, y: 27.6 }, 1)).toBeNull();
  });

  it('picks the nearer field when two share a wall', () => {
    // Form 101's two date fields sit edge to edge on one rule at one pitch.
    const left: CombRegion = { pageIndex: 0, left: 4.8, top: 27.3, width: 15.2, height: 0.84, cells: 8 };
    const right: CombRegion = { pageIndex: 0, left: 20.0, top: 27.3, width: 15.3, height: 0.84, cells: 8 };
    expect(combRegionAt([left, right], { x: 6, y: 27.5 }, 0)).toBe(left);
    expect(combRegionAt([left, right], { x: 34, y: 27.5 }, 0)).toBe(right);
  });
});

describe('checkboxRegionAt', () => {
  // A 6.6pt square on the health declaration: about a millimetre and a half.
  const yes: FieldRegion = { pageIndex: 0, left: 52.377, top: 42.266, width: 1.113, height: 0.784 };
  const no: FieldRegion = { pageIndex: 0, left: 56.432, top: 42.266, width: 1.109, height: 0.784 };

  it('accepts a tap a little outside the box, which is smaller than a fingertip', () => {
    expect(checkboxRegionAt([yes], { x: 52.0, y: 42.0 }, 0)).toBe(yes);
  });

  it('picks the nearer box when two tap areas overlap', () => {
    expect(checkboxRegionAt([yes, no], { x: 53.4, y: 42.7 }, 0)).toBe(yes);
    expect(checkboxRegionAt([yes, no], { x: 56.0, y: 42.7 }, 0)).toBe(no);
  });

  it('rejects a tap well clear of any box', () => {
    expect(checkboxRegionAt([yes, no], { x: 40, y: 42.7 }, 0)).toBeNull();
  });
});

describe('combFontSize', () => {
  const cellPercent = IDENTITY_RUN.width / IDENTITY_RUN.cells; // 11.34pt cells

  it('keeps the remembered size when it fits the printed cell', () => {
    expect(combFontSize(12, cellPercent, PAGE_WIDTH)).toBe(12);
  });

  it('shrinks a size whose characters would not fit the cell', () => {
    // A comb whose cells are narrower than the characters in them has stopped
    // doing the one thing it exists for.
    expect(combFontSize(24, cellPercent, PAGE_WIDTH)).toBeCloseTo(11.344 / 0.6, 1);
  });

  it("never goes below the editor's own minimum", () => {
    expect(combFontSize(12, 0.1, PAGE_WIDTH)).toBe(6);
  });
});

describe('placeCombOnRegion', () => {
  const place = (region = IDENTITY_RUN, fontSize = 12, fontFamily = 'Arimo') => placeCombOnRegion(region, {
    fontSize, fontFamily, pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT,
  });

  it('takes the span and the cell count from the paper', () => {
    const placement = place();
    expect(placement.left).toBe(IDENTITY_RUN.left);
    expect(placement.width).toBe(IDENTITY_RUN.width);
    expect(placement.combCells).toBe(9);
  });

  it('puts the glyph baseline on the printed rule when the cells are open', () => {
    // The run's teeth hang upward from the rule, so in top-left-origin
    // percentages the rule is the run's *bottom* edge. Lifting the box by its
    // own baseline drop is what lands the digits on that line instead of a
    // point below it, which is what put the rule through the digits.
    const placement = place();
    const rule = IDENTITY_RUN.top + IDENTITY_RUN.height;
    const baseline = placement.top + (placement.fontSize * baselineDropEm('Arimo') / PAGE_HEIGHT) * 100;
    expect(baseline).toBeCloseTo(rule, 10);
  });

  it('centres the text in the cell when the cells are closed boxes', () => {
    // The health declaration draws each cell as a rectangle. There is no line
    // to write on, so the digits belong in the middle - putting a baseline on
    // the box's lower edge sits them on it, which is what happens on paper only
    // when the paper has a line there.
    const boxedRun: CombRegion = { ...IDENTITY_RUN, boxed: true, height: 1.297 };
    const placement = placeCombOnRegion(boxedRun, {
      fontSize: 12, fontFamily: 'Arimo', pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT,
    });
    const em = (12 / PAGE_HEIGHT) * 100;
    const baseline = placement.top + em * baselineDropEm('Arimo');
    const cellMiddle = boxedRun.top + boxedRun.height / 2;

    // The font's em box straddles the cell's middle rather than resting on its
    // floor, so the baseline sits below the middle by half the em box.
    expect(baseline).toBeGreaterThan(cellMiddle);
    expect(baseline).toBeLessThan(boxedRun.top + boxedRun.height);
    expect(baseline - cellMiddle).toBeCloseTo(em * (0.905 - 0.212) / 2, 3);
  });

  it('places the same run differently depending on whether its cells are closed', () => {
    const open = place({ ...IDENTITY_RUN, boxed: false, height: 1.297 });
    const boxed = place({ ...IDENTITY_RUN, boxed: true, height: 1.297 });
    expect(boxed.top).toBeLessThan(open.top);
  });

  it("uses the font's own metrics, not a Helvetica fallback", () => {
    // Pacifico's loops need far more room above the baseline than Arimo's, so
    // the same run has to place the two boxes at different heights to put both
    // baselines on the same rule.
    expect(baselineDropEm('Pacifico')).not.toBeCloseTo(baselineDropEm('Arimo'), 3);
    expect(place(IDENTITY_RUN, 12, 'Pacifico').top).not.toBeCloseTo(place().top, 3);
  });

  it('centres each character in its printed cell, via comb.js', () => {
    // The detected pitch is 11.34pt, so consecutive centres must be 11.34pt
    // apart - that is the whole point, and comb.js owns the arithmetic.
    const placement = place();
    const centres = [0, 1, 2].map(
      (index) => placement.left + combCellCenterFraction(index, placement.combCells) * placement.width,
    );
    const pitchPercent = (11.3447 / PAGE_WIDTH) * 100;
    expect(centres[1] - centres[0]).toBeCloseTo(pitchPercent, 3);
    expect(centres[2] - centres[1]).toBeCloseTo(pitchPercent, 3);
  });

  it('never lifts the box off the top of the page', () => {
    expect(place({ ...IDENTITY_RUN, top: 0, height: 0 }).top).toBe(0);
  });
});

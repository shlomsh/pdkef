import { describe, expect, it } from 'vitest';
import {
  baselineDropEm,
  cellFontSize,
  cellRegionAt,
  checkboxRegionAt,
  combFontSize,
  combRegionAt,
  placeCombOnRegion,
  placeTextOnCell,
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

describe('cellRegionAt', () => {
  // A blank name cell on the health declaration, well over a checkbox in size.
  const nameCell: FieldRegion = { pageIndex: 0, left: 30.5, top: 28.6, width: 26.0, height: 1.4 };

  it('finds the cell a tap lands in', () => {
    expect(cellRegionAt([nameCell], { x: 40, y: 29 }, 0)).toBe(nameCell);
  });

  it('accepts a tap a little outside the cell, for tap and measurement slack', () => {
    expect(cellRegionAt([nameCell], { x: 30.2, y: 28.3 }, 0)).toBe(nameCell);
  });

  it('rejects a tap well clear of the cell', () => {
    expect(cellRegionAt([nameCell], { x: 10, y: 28.6 }, 0)).toBeNull();
  });

  it('rejects a tap on another page', () => {
    expect(cellRegionAt([nameCell], { x: 40, y: 29 }, 1)).toBeNull();
  });

  it('picks the nearer cell when two tap areas overlap', () => {
    const left: FieldRegion = { pageIndex: 0, left: 10, top: 40, width: 10, height: 2 };
    const right: FieldRegion = { pageIndex: 0, left: 20.4, top: 40, width: 10, height: 2 };
    expect(cellRegionAt([left, right], { x: 19.8, y: 41 }, 0)).toBe(left);
    expect(cellRegionAt([left, right], { x: 20.6, y: 41 }, 0)).toBe(right);
  });
});

describe('cellFontSize', () => {
  // The e-ticket "Status" column: a short row, 1.4% of an A4 page tall
  // (~11.8pt) - narrow enough that even the 12pt default overflows it.
  const shortCellPercent = 1.4;

  it('keeps the remembered size when it fits the row', () => {
    expect(cellFontSize(8, shortCellPercent, PAGE_HEIGHT)).toBe(8);
  });

  it('shrinks a size whose one-line box is taller than the row', () => {
    // A box taller than the row it was placed on doesn't grow past a
    // printed boundary the way minWidth does horizontally - it sits on top
    // of the row below. ceiling = 11.78646pt / 1.29em (TEXT_BOX_LINE_HEIGHT_EM).
    expect(cellFontSize(12, shortCellPercent, PAGE_HEIGHT)).toBeCloseTo(11.78646 / 1.29, 2);
  });

  it("never goes below the editor's own minimum", () => {
    expect(cellFontSize(12, 0.1, PAGE_HEIGHT)).toBe(6);
  });

  it('returns the preferred size unchanged for a degenerate (zero-height) cell', () => {
    expect(cellFontSize(12, 0, PAGE_HEIGHT)).toBe(12);
  });
});

describe('placeTextOnCell', () => {
  // The "Status" cell on the e-ticket that shipped this bug: a 12pt box
  // placed on it hung well past the row into "Confirmed" below.
  const shortCell: FieldRegion = { pageIndex: 0, left: 30, top: 28, width: 26, height: 1.4 };
  // A cell tall enough that the preferred size already fits, so nothing here
  // is a shrink - the placement math below is unaffected by cellFontSize.
  const roomyCell: FieldRegion = { pageIndex: 0, left: 30, top: 28, width: 26, height: 4 };

  it('puts the box on the cell\'s left edge, centred on its middle, spanning its width', () => {
    // top: the cell's middle (30) less half the box's height, the same
    // re-centring a raw tap gets. `left` is the physical left edge whichever
    // way the text will read - a box with a span has no growing edge to
    // anchor - and not the cell's middle (43), which used to hang the box's
    // right half out over the next column.
    const placed = placeTextOnCell(roomyCell, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT });
    expect(placed.left).toBe(30);
    expect(placed.minWidth).toBe(26);
    expect(placed.fontSize).toBe(12);
    expect(placed.top).toBeCloseTo(30 - (12 * 1.29 / PAGE_HEIGHT * 100) / 2, 5);
  });

  it('gives the span as minWidth, never width, so the box stays plain text and not a comb', () => {
    expect(placeTextOnCell(roomyCell, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT })).not.toHaveProperty('width');
  });

  it('never lifts the box off the top of the page', () => {
    // A cell shorter than even the floored MIN_FONT_SIZE_PT's one-line box
    // (6pt * 1.29em ~= 0.92% of the page): shrinking still isn't enough, so
    // the box's own height, not the cell's, decides whether centring would
    // go negative.
    const tinyNearTop: FieldRegion = { pageIndex: 0, left: 30, top: 0.05, width: 26, height: 0.3 };
    expect(placeTextOnCell(tinyNearTop, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT }).top).toBe(0);
  });

  it('shrinks the font to fit a short row instead of overflowing into the next one', () => {
    // This is the actual bug: an unshrunk 12pt box in this 1.4%-tall cell is
    // ~15.5pt of box in an ~11.8pt row - it visibly crosses into the next
    // printed line. The returned fontSize must be small enough that the
    // box's own one-line height (fontSize * 1.29em, in page percent) is no
    // taller than the cell.
    const placed = placeTextOnCell(shortCell, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT });
    expect(placed.fontSize).toBeLessThan(12);
    const boxHeightPercent = (placed.fontSize * 1.29 / PAGE_HEIGHT) * 100;
    expect(boxHeightPercent).toBeLessThanOrEqual(shortCell.height + 1e-9);
  });

  it('re-centres on the shrunk box\'s own height, not the unshrunk one', () => {
    const placed = placeTextOnCell(shortCell, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT });
    const shrunkTextHeight = (placed.fontSize * 1.29 / PAGE_HEIGHT) * 100;
    expect(placed.top).toBeCloseTo(shortCell.top + shortCell.height / 2 - shrunkTextHeight / 2, 5);
  });

  describe('on a cell with a printed label in its corner', () => {
    // Form 101's employer "מספר טלפון" cell, live: 25.6pt tall (157.0-182.6pt),
    // the label's baseline 7.7pt down from the top rule, so the blank strip a
    // person writes in is the 17.9pt under it. Centring on the whole cell put
    // the typed number's top against the label (reported).
    const labelled: FieldRegion = {
      pageIndex: 0, left: 21.888, top: 18.648, width: 13.221, height: 3.041,
      writable: { left: 21.888, top: 19.563, width: 13.221, height: 2.126 },
    };

    it('centres the box in the writable strip under the label, not in the whole cell', () => {
      const placed = placeTextOnCell(labelled, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT });
      const textHeight = (12 * 1.29 / PAGE_HEIGHT) * 100;
      const strip = labelled.writable!;
      expect(placed.fontSize).toBe(12);
      expect(placed.top).toBeCloseTo(strip.top + strip.height / 2 - textHeight / 2, 5);
      // The box's top is below the label's baseline - the whole point.
      expect(placed.top).toBeGreaterThan(strip.top);
    });

    it('sizes the font by the strip, not the cell, so a tall label leaves less room', () => {
      // Same cell, but only 9pt of blank under the label: 12pt (a 15.5pt box)
      // would cross the label; the strip caps it.
      const cramped: FieldRegion = { ...labelled, writable: { ...labelled.writable!, height: 1.069 } };
      const placed = placeTextOnCell(cramped, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT });
      expect(placed.fontSize).toBeCloseTo(cellFontSize(12, 1.069, PAGE_HEIGHT), 5);
      expect(placed.fontSize).toBeLessThan(12);
    });

    it('spans the strip beside a label, when that is where the blank is', () => {
      const beside: FieldRegion = {
        pageIndex: 0, left: 50, top: 40, width: 20, height: 1.6,
        writable: { left: 50, top: 40, width: 14, height: 1.6 },
      };
      const placed = placeTextOnCell(beside, { fontSize: 12, pageHeightPoints: PAGE_HEIGHT });
      expect(placed.left).toBe(50);
      expect(placed.minWidth).toBe(14);
    });
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

  it('also fits the digits inside a height, when the caller has one to give', () => {
    // 7.04pt of height on 11.34pt-wide cells: width alone allows 18.9pt, a
    // 12pt default's 8.6pt digits are too tall, the cap-height rule says 9.78pt.
    const size = combFontSize(12, cellPercent, PAGE_WIDTH, IDENTITY_RUN.height, PAGE_HEIGHT);
    expect(size).toBeCloseTo(7.0384 / 0.72, 1);
    expect(size * 0.72).toBeLessThanOrEqual((IDENTITY_RUN.height / 100) * PAGE_HEIGHT + 1e-9);
  });

  it('leaves a size alone when the ink is tall enough for it', () => {
    // A closed 10.9pt box (the health declaration): 12pt digits are 8.6pt, they fit.
    expect(combFontSize(12, cellPercent, PAGE_WIDTH, 1.297, PAGE_HEIGHT)).toBe(12);
  });

  it('takes the stricter of the two bounds', () => {
    // Wide, short teeth: height says 9.78pt, width would allow 18.9pt.
    expect(combFontSize(24, cellPercent, PAGE_WIDTH, IDENTITY_RUN.height, PAGE_HEIGHT)).toBeCloseTo(7.0384 / 0.72, 1);
    // Narrow, tall boxes: width says 8.3pt, height would allow 15pt.
    expect(combFontSize(24, 5 / 595.275 * 100, PAGE_WIDTH, 1.297, PAGE_HEIGHT)).toBeCloseTo(5 / 0.6, 1);
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

  it('keeps the form-wide size on open teeth - they divide the field, they do not bound its height', () => {
    // Form 101's identity comb: 4-7pt ticks hanging from the rule of a 23pt
    // field, the same height as the name cells beside it. Sizing digits to
    // the ticks made this one field smaller than its neighbours (live
    // report); the ticks only say how wide a cell is.
    expect(place().fontSize).toBe(12);
  });

  it('fits the digits inside a closed box, with the margin a hand would leave', () => {
    // The health declaration's closed 10.8pt boxes: 12pt digits (8.6pt) are
    // inside the 80% fill line, so the default is untouched there...
    expect(place({ ...IDENTITY_RUN, boxed: true, height: 1.283 }).fontSize).toBe(12);
    // ...and a box only as tall as the identity ticks would shrink them.
    expect(place({ ...IDENTITY_RUN, boxed: true }).fontSize).toBeCloseTo(
      combFontSize(12, IDENTITY_RUN.width / 9, PAGE_WIDTH, IDENTITY_RUN.height * 0.8, PAGE_HEIGHT), 5,
    );
  });

  it('centres the digits in the cell drawn around open teeth, where the neighbouring cells\' text sits', () => {
    // The identity comb's 23pt cell on form 101, its label in the top corner
    // leaving a 14pt strip above the rule. A 12pt box (15.5pt) centred there
    // puts the baseline ~3pt above the rule, like the name cells beside it.
    const inCell: CombRegion = { ...IDENTITY_RUN, writable: { left: 73.597, top: 26.4, width: 17.152, height: 1.69 } };
    const placement = place(inCell);
    const strip = inCell.writable!;
    const boxHeight = (placement.fontSize * 1.29 / PAGE_HEIGHT) * 100;
    expect(placement.top + boxHeight / 2).toBeCloseTo(strip.top + strip.height / 2, 3);
    expect(placement.top).toBeLessThan(place().top);
    expect(placement.fontSize).toBe(12);
  });

  it('never sinks the digits below the rule when the cell\'s strip is shorter than the box', () => {
    const shallow: CombRegion = { ...IDENTITY_RUN, writable: { left: 73.597, top: 27.3, width: 17.152, height: 0.8 } };
    expect(place(shallow).top).toBeCloseTo(place().top, 6);
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

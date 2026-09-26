import { describe, expect, it } from 'vitest';
import {
  baselineDropEm,
  cellRegionAt,
  checkboxRegionAt,
  combRegionAt,
  fieldFontSize,
  placeCombOnRegion,
  placeTextOnCell,
  type CombRegion,
  type FieldRegion,
} from './combPlacement.ts';
import { combCellCenterFraction } from './comb.js';
import { figureCentreEm } from './fonts.js';
import { COMB_CAP_HEIGHT_EM, COMB_MIN_CELL_EM, MIN_FONT_SIZE_PT, TEXT_BOX_LINE_HEIGHT_EM } from '../../constants/signGeometry.js';

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

  // Form 101's employer cells: the field is the blank band, but a person aims
  // at the printed box, caption included.
  const labelled: FieldRegion = {
    pageIndex: 0,
    left: 21.9, top: 19.6, width: 13.2, height: 2.1,
    enclosure: { left: 21.9, top: 18.6, width: 13.2, height: 3.0 },
  };

  it('takes a tap on the printed caption above the band as a tap on the field', () => {
    expect(cellRegionAt([labelled], { x: 28, y: 19 }, 0)).toBe(labelled);
  });

  it('still rejects a tap clear of the printed box', () => {
    expect(cellRegionAt([labelled], { x: 28, y: 17.5 }, 0)).toBeNull();
  });
});

// SIGN-32: fieldFontSize is the one function every placement path (text
// cell, comb, date on either, free text) reads for its size. combPlacement.ts's
// own docstring on it has the full rule; these are its edges in isolation -
// placeTextOnCell/placeCombOnRegion below cover the same rule wired to real
// field geometry (percent-of-page in, ceilings/seed height in points out).
describe('fieldFontSize', () => {
  describe('a carried size already exists - shrink-only fit, never grows', () => {
    // The e-ticket "Status" column: a short row, 1.4% of an A4 page tall
    // (~11.8pt) - narrow enough that even the 12pt default overflows it.
    const shortCellPoints = (1.4 / 100) * PAGE_HEIGHT;
    const shortCellCeiling = shortCellPoints / TEXT_BOX_LINE_HEIGHT_EM;

    it('keeps the carried size when it fits the row', () => {
      expect(fieldFontSize(8, { heightCeilingPoints: shortCellCeiling })).toBe(8);
    });

    it('shrinks a carried size whose one-line box is taller than the row', () => {
      // A box taller than the row it was placed on doesn't grow past a
      // printed boundary the way minWidth does horizontally - it sits on top
      // of the row below.
      expect(fieldFontSize(12, { heightCeilingPoints: shortCellCeiling })).toBeCloseTo(shortCellCeiling, 5);
    });

    it("never goes below the editor's own minimum", () => {
      const tinyCeiling = ((0.1 / 100) * PAGE_HEIGHT) / TEXT_BOX_LINE_HEIGHT_EM;
      expect(fieldFontSize(12, { heightCeilingPoints: tinyCeiling })).toBe(MIN_FONT_SIZE_PT);
    });

    it('returns the carried size unchanged with no ceiling at all (free text, or an open comb\'s teeth)', () => {
      expect(fieldFontSize(12, {})).toBe(12);
    });

    it('takes the stricter of a width and a height ceiling together (a comb)', () => {
      // Wide, short teeth: height is the binding ceiling.
      expect(fieldFontSize(24, { widthCeilingPoints: 18.9, heightCeilingPoints: 9.78 })).toBeCloseTo(9.78, 5);
      // Narrow, tall boxes: width is the binding ceiling.
      expect(fieldFontSize(24, { widthCeilingPoints: 8.3, heightCeilingPoints: 15 })).toBeCloseTo(8.3, 5);
    });

    it('never grows a carried size toward a field\'s own fill target - only seeding does that', () => {
      // The practice form's "Full name" row (22pt): a carried size well
      // under the field's own fill target stays exactly where it was, never
      // jumping toward what a fresh document would have seeded here.
      const fullNameHeightPoints = 22;
      const ceiling = fullNameHeightPoints / TEXT_BOX_LINE_HEIGHT_EM;
      expect(fieldFontSize(6, { seedHeightPoints: fullNameHeightPoints, heightCeilingPoints: ceiling })).toBe(6);
    });
  });

  describe('no carried size yet - seeds it, once', () => {
    it('takes DEFAULT_FONT_SIZE_PT when there is no field height to grow toward (free text)', () => {
      expect(fieldFontSize(null, {})).toBe(12);
    });

    it('takes DEFAULT_FONT_SIZE_PT for a degenerate (zero-height) field too', () => {
      expect(fieldFontSize(null, { seedHeightPoints: 0 })).toBe(12);
    });

    describe('a generously tall field (the practice form\'s "Full name" row, SNG-10 follow-up)', () => {
      // 22pt tall, well past the ~21.5pt (FIELD_FONT_MAX_PT / FIELD_FONT_FILL_RATIO)
      // where the cap engages.
      const fullNameHeightPoints = 22;

      it('seeds the fill target, capped at FIELD_FONT_MAX_PT', () => {
        // 22 * 0.65 = 14.3pt, capped at FIELD_FONT_MAX_PT (14).
        expect(fieldFontSize(null, { seedHeightPoints: fullNameHeightPoints })).toBe(14);
      });

      it('never seeds past the field itself: the resulting box still clears the cap comfortably', () => {
        const size = fieldFontSize(null, { seedHeightPoints: fullNameHeightPoints });
        const boxHeightPt = size * TEXT_BOX_LINE_HEIGHT_EM;
        expect(boxHeightPt).toBeLessThan(fullNameHeightPoints);
      });
    });

    it('is still floored at MIN_FONT_SIZE_PT for a field far too short to hold the fill ratio', () => {
      expect(fieldFontSize(null, { seedHeightPoints: 0.01 })).toBe(MIN_FONT_SIZE_PT);
    });
  });
});

describe('placeTextOnCell', () => {
  // The "Status" cell on the e-ticket that shipped this bug: a 12pt box
  // placed on it hung well past the row into "Confirmed" below.
  const shortCell: FieldRegion = { pageIndex: 0, left: 30, top: 28, width: 26, height: 1.4 };
  // A cell tall enough that a carried size well clears fieldFontSize's own
  // ceiling (26.1pt) with room to spare - but past the SNG-10 follow-up's
  // ~21.5pt seeding threshold, so a document with nothing carried yet still
  // seeds the field-fill target (capped at FIELD_FONT_MAX_PT, 14) here. The
  // placement math below (left, minWidth, the re-centring formula) is
  // unaffected either way - only the font size itself is.
  const roomyCell: FieldRegion = { pageIndex: 0, left: 30, top: 28, width: 26, height: 4 };

  it('puts the box on the cell\'s left edge, centred on its middle, spanning its width', () => {
    // top: the cell's middle (30) less half the box's height, the same
    // re-centring a raw tap gets. `left` is the physical left edge whichever
    // way the text will read - a box with a span has no growing edge to
    // anchor - and not the cell's middle (43), which used to hang the box's
    // right half out over the next column.
    const placed = placeTextOnCell(roomyCell, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
    expect(placed.left).toBe(30);
    expect(placed.minWidth).toBe(26);
    // A carried size already exists and the roomy cell's own ceiling is well
    // above it, so it passes through exactly - fit, never grown.
    expect(placed.fontSize).toBe(12);
    // SIGN-38: the digits' own ink centred on the cell's middle (Arimo's
    // figureCentreEm), not the font's whole em box, then dropped by the same
    // small padding every font keeps toward the writing line and lifted back
    // to the box's top by Arimo's own baseline drop.
    const em12 = (12 / PAGE_HEIGHT) * 100;
    expect(placed.top).toBeCloseTo(30 + em12 * (figureCentreEm('Arimo') + 0.12 - baselineDropEm('Arimo')), 5);
  });

  it('seeds the field-fill target on a document with nothing carried yet, and centres on that seeded height', () => {
    // See fieldFontSize's own "no carried size yet" tests for the 14pt
    // target's derivation - this proves the same seeding wired to a real
    // placeTextOnCell call, left/minWidth/top math included.
    const placed = placeTextOnCell(roomyCell, { carriedFontSize: null, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
    expect(placed.fontSize).toBe(14);
    const em14 = (14 / PAGE_HEIGHT) * 100;
    expect(placed.top).toBeCloseTo(30 + em14 * (figureCentreEm('Arimo') + 0.12 - baselineDropEm('Arimo')), 5);
  });

  it('gives the span as minWidth, never width, so the box stays plain text and not a comb', () => {
    expect(placeTextOnCell(roomyCell, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' })).not.toHaveProperty('width');
  });

  it('never lifts the box off the top of the page', () => {
    // A cell shorter than even the floored MIN_FONT_SIZE_PT's one-line box
    // (6pt * 1.29em ~= 0.92% of the page): shrinking still isn't enough, so
    // the box's own height, not the cell's, decides whether centring would
    // go negative.
    const tinyNearTop: FieldRegion = { pageIndex: 0, left: 30, top: 0.05, width: 26, height: 0.3 };
    expect(placeTextOnCell(tinyNearTop, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' }).top).toBe(0);
  });

  it('shrinks the carried size to fit a short row instead of overflowing into the next one', () => {
    // This is the actual bug: an unshrunk 12pt box in this 1.4%-tall cell is
    // ~15.5pt of box in an ~11.8pt row - it visibly crosses into the next
    // printed line. The returned fontSize must be small enough that the
    // box's own one-line height (fontSize * 1.29em, in page percent) is no
    // taller than the cell.
    const placed = placeTextOnCell(shortCell, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
    expect(placed.fontSize).toBeLessThan(12);
    const boxHeightPercent = (placed.fontSize * 1.29 / PAGE_HEIGHT) * 100;
    expect(boxHeightPercent).toBeLessThanOrEqual(shortCell.height + 1e-9);
  });

  it('re-centres on the shrunk box\'s own height, not the unshrunk one', () => {
    const placed = placeTextOnCell(shortCell, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
    const shrunkEm = (placed.fontSize / PAGE_HEIGHT) * 100;
    expect(placed.top).toBeCloseTo(
      shortCell.top + shortCell.height / 2 + shrunkEm * (figureCentreEm('Arimo') + 0.12 - baselineDropEm('Arimo')),
      5,
    );
  });

  it('the next field after a narrow one gets the carried size back - shrinking never writes back to it', () => {
    // shortCell shrinks a 12pt carried size (as above); a roomy cell placed
    // right after, still with the same 12pt carried size, must not have
    // inherited that shrink.
    const shrunk = placeTextOnCell(shortCell, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
    expect(shrunk.fontSize).toBeLessThan(12);
    const next = placeTextOnCell(roomyCell, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
    expect(next.fontSize).toBe(12);
  });

  describe('on a cell whose printed caption hugs a wall', () => {
    // Form 101's employer "מספר טלפון נייד" cell, exactly as
    // `detectCellCandidates` emits it (page 1, live PDF): the bounds are the
    // whole ruled cell, because a side carve is too weak a guess to publish
    // as the field's extent, and the 6.72%-wide blank strip beside the
    // caption rides along as `writable`. The caption is printed against the
    // cell's right wall, from 12.29% rightwards.
    //
    // The three tests this replaced hand-built a region with a `writable`
    // strip *under* a caption and a bounds box the whole cell - a shape
    // `formCells.js` cannot emit for either carve - and so went on passing
    // while the product placed its boxes the other way (regression from
    // 1a692b3). A region here is only worth asserting on if the detector
    // could hand it over.
    const captioned: FieldRegion = {
      pageIndex: 0, left: 5.568, top: 36.321, width: 28.941, height: 2.637,
      writable: { left: 5.568, top: 36.321, width: 6.720, height: 2.637 },
    };
    const captionLeft = 12.288; // where the printed caption starts

    it('spans the strip beside the caption, not the whole cell', () => {
      const placed = placeTextOnCell(captioned, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
      expect(placed.left).toBe(5.568);
      expect(placed.minWidth).toBe(6.720);
    });

    it('keeps the typed box off the caption, which on an RTL form is where the text starts', () => {
      // A box with a span lays its lines against whichever edge getTextAlign
      // says, and on this form that is the right one - so the span's right
      // edge is where the first character lands, in the export as much as on
      // screen. Spanning the whole cell would start it on the caption.
      const placed = placeTextOnCell(captioned, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
      expect(placed.left + placed.minWidth).toBeLessThanOrEqual(captionLeft);
    });

    it('takes the bounds themselves when there is no strip to honour', () => {
      // The other carve, and the common one: a caption in a band above the
      // writing line leaves the bounds already equal to the strip, so no
      // `writable` is published and nothing here has to know which case it is.
      const { writable, ...band } = captioned;
      const placed = placeTextOnCell(band, { carriedFontSize: 12, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
      expect(placed.left).toBe(band.left);
      expect(placed.minWidth).toBe(band.width);
    });
  });

  describe('SIGN-38: the digits\' own centre lands at the same height in every font', () => {
    // 14pt in a 22pt cell - the exact live-report measurement (a spread of
    // 0.07pt to 7.75pt between fonts' digit centres and the cell's own
    // middle, before this fix). A cell tall enough that the carried size
    // passes straight through unshrunk, so only the vertical formula is
    // under test.
    // top: 30, not 0 - away from the page edge, so the "never lifts off the
    // top of the page" clamp (Math.max(0, top)) never engages and masks the
    // formula under test, the way Pacifico's own generous ascent otherwise
    // would at the page's very top.
    const cell22pt: FieldRegion = { pageIndex: 0, left: 30, top: 30, width: 26, height: (22 / PAGE_HEIGHT) * 100 };
    const inkCentreAboveTop = (family: string, fontSize = 14) => {
      const placed = placeTextOnCell(cell22pt, { carriedFontSize: fontSize, pageHeightPoints: PAGE_HEIGHT, fontFamily: family });
      const em = (fontSize / PAGE_HEIGHT) * 100;
      const baseline = placed.top + em * baselineDropEm(family);
      return baseline - em * figureCentreEm(family);
    };

    it('puts every family\'s digit centre the same small distance below the cell\'s own middle, regardless of the font', () => {
      // The formula's whole point: figureCentreEm cancels out of
      // baseline - em*figureCentreEm, so what is left is the cell's middle
      // plus the one deliberate, font-independent drop toward the writing
      // line (TEXT_BOX_PADDING_EM) - never the font's own ascent/descent.
      const em = (14 / PAGE_HEIGHT) * 100;
      const target = cell22pt.top + cell22pt.height / 2 + em * 0.12;
      for (const family of ['Arimo', 'Gveret Levin', 'Caveat', 'Pacifico']) {
        expect(inkCentreAboveTop(family)).toBeCloseTo(target, 6);
      }
    });

    it('agrees across fonts to within 0.02em', () => {
      const centres = ['Arimo', 'Gveret Levin', 'Caveat', 'Pacifico'].map((family) => inkCentreAboveTop(family));
      const em = (14 / PAGE_HEIGHT) * 100;
      for (const centre of centres) {
        expect(Math.abs(centre - centres[0])).toBeLessThan(0.02 * em);
      }
    });

    it('leaves Arimo\'s own top within 0.05pt of the pre-SIGN-38 formula (Shlomi\'s approved look)', () => {
      const placed = placeTextOnCell(cell22pt, { carriedFontSize: 14, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' });
      const em = (14 / PAGE_HEIGHT) * 100;
      const oldTopPercent = cell22pt.top + cell22pt.height / 2 - (em * TEXT_BOX_LINE_HEIGHT_EM) / 2 + em * 0.12;
      const diffPt = ((placed.top - oldTopPercent) / 100) * PAGE_HEIGHT;
      expect(Math.abs(diffPt)).toBeLessThan(0.05);
    });
  });
});

describe('placeCombOnRegion', () => {
  const place = (region = IDENTITY_RUN, carriedFontSize: number | null = 12, fontFamily = 'Arimo') => placeCombOnRegion(region, {
    carriedFontSize, fontFamily, pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT,
  });

  it('takes the span and the cell count from the paper', () => {
    const placement = place();
    expect(placement.left).toBe(IDENTITY_RUN.left);
    expect(placement.width).toBe(IDENTITY_RUN.width);
    expect(placement.combCells).toBe(9);
  });

  it('keeps the carried size on open teeth - they divide the field, they do not bound its height', () => {
    // Form 101's identity comb: 4-7pt ticks hanging from the rule of a 23pt
    // field, the same height as the name cells beside it. Sizing digits to
    // the ticks made this one field smaller than its neighbours (live
    // report); the ticks only say how wide a cell is.
    expect(place().fontSize).toBe(12);
  });

  it('shrinks a carried size whose characters would not fit the cell', () => {
    // A comb whose cells are narrower than the characters in them has stopped
    // doing the one thing it exists for.
    expect(place(IDENTITY_RUN, 24).fontSize).toBeCloseTo(11.344 / COMB_MIN_CELL_EM, 1);
  });

  it("never goes below the editor's own minimum", () => {
    // A pitch of 0.1pt-wide cells: width says (0.1/100*PAGE_WIDTH)/COMB_MIN_CELL_EM, well under MIN_FONT_SIZE_PT.
    const sliver: CombRegion = { ...IDENTITY_RUN, width: 0.1 * IDENTITY_RUN.cells };
    expect(place(sliver, 12).fontSize).toBe(MIN_FONT_SIZE_PT);
  });

  it('shrinks a narrow comb only - the next field gets the carried size back', () => {
    const sliver: CombRegion = { ...IDENTITY_RUN, width: 0.1 * IDENTITY_RUN.cells };
    const shrunk = place(sliver, 12);
    expect(shrunk.fontSize).toBeLessThan(12);
    // Same carried size, an ordinary (not narrow) comb right after: no drag-down.
    expect(place(IDENTITY_RUN, 12).fontSize).toBe(12);
  });

  it('fits the digits inside a closed box, with the margin a hand would leave', () => {
    // The health declaration's closed 10.8pt boxes: 12pt digits (8.6pt) are
    // inside the 80% fill line, so the carried size is untouched there...
    expect(place({ ...IDENTITY_RUN, boxed: true, height: 1.283 }, 12).fontSize).toBe(12);
    // ...and a box only as tall as the identity ticks would shrink them: width
    // alone would allow far more than 12, so the cap-height ceiling binds.
    const shrunkToHeight = place({ ...IDENTITY_RUN, boxed: true }, 12).fontSize;
    expect(shrunkToHeight).toBeLessThan(12);
    const digitHeightPoints = (IDENTITY_RUN.height * 0.8 / 100) * PAGE_HEIGHT;
    expect(shrunkToHeight).toBeCloseTo(digitHeightPoints / COMB_CAP_HEIGHT_EM, 5);
  });

  it('takes the stricter of a width and a height ceiling together', () => {
    // Wide, short teeth (IDENTITY_RUN's own cells, boxed): height binds.
    const wideShort = place({ ...IDENTITY_RUN, boxed: true }, 24).fontSize;
    const digitHeightPoints = (IDENTITY_RUN.height * 0.8 / 100) * PAGE_HEIGHT;
    expect(wideShort).toBeCloseTo(digitHeightPoints / COMB_CAP_HEIGHT_EM, 1);
    // Narrow, tall boxes: width binds instead.
    const narrowTall: CombRegion = { ...IDENTITY_RUN, width: (5 / 595.275 * 100) * IDENTITY_RUN.cells, boxed: true, height: 1.297 };
    expect(place(narrowTall, 24).fontSize).toBeCloseTo(5 / COMB_MIN_CELL_EM, 1);
  });

  it('seeds the carried size from the comb\'s own cell height, on a document with nothing carried yet', () => {
    // See fieldFontSize's "no carried size yet" tests for the fill-target
    // math; this proves it wired to a real boxed CombRegion whose cell
    // height (not the digit-height fraction the ceiling above reads) is 22pt
    // - the practice form's ID number comb, ground truth height.
    const region: CombRegion = { ...IDENTITY_RUN, boxed: true, height: (22 / PAGE_HEIGHT) * 100 };
    expect(place(region, null).fontSize).toBe(14);
  });

  it('seeds an open comb inside a printed cell from its writable strip, the same size a cell in its row seeds from', () => {
    // Form 101's birth-date comb: teeth about 0.5% of the page tall (~4.2pt),
    // hanging inside a printed cell whose writable strip is about 2.2% of the
    // page (~18.5pt) - the same strip height the name cells sharing that row
    // seed from. Seeding from the teeth alone floored this comb to
    // MIN_FONT_SIZE_PT while its row read at ~11.8pt (live report, form 101).
    const stripHeight = 2.2;
    const openCombInCell: CombRegion = {
      ...IDENTITY_RUN,
      height: 0.5,
      writable: { left: IDENTITY_RUN.left, top: IDENTITY_RUN.top, width: IDENTITY_RUN.width, height: stripHeight },
    };
    const rowCell: FieldRegion = {
      pageIndex: 0,
      left: 10,
      top: 27,
      width: 20,
      height: stripHeight,
    };
    const combSize = place(openCombInCell, null).fontSize;
    const cellSize = placeTextOnCell(rowCell, { carriedFontSize: null, pageHeightPoints: PAGE_HEIGHT, fontFamily: 'Arimo' }).fontSize;
    expect(combSize).toBe(cellSize);
    expect(combSize).toBeGreaterThan(MIN_FONT_SIZE_PT);
  });

  it('centres the digits in the cell drawn around open teeth, where the neighbouring cells\' text sits', () => {
    // The identity comb's 23pt cell on form 101, its label in the top corner
    // leaving a 14pt strip above the rule. A 12pt box (15.5pt) centred there
    // puts the baseline ~3pt above the rule, like the name cells beside it -
    // lowered by the box's bottom padding, exactly as those cells' text is.
    const inCell: CombRegion = { ...IDENTITY_RUN, writable: { left: 73.597, top: 26.4, width: 17.152, height: 1.69 } };
    const placement = place(inCell);
    const strip = inCell.writable!;
    const em = (placement.fontSize / PAGE_HEIGHT) * 100;
    // Same cellTextTop rule the name cells beside it place through
    // (SIGN-38): the digits' own ink centred on the strip's middle, plus the
    // font-independent drop toward the writing line, less Arimo's own
    // baseline drop back up to the box's top.
    expect(placement.top).toBeCloseTo(
      strip.top + strip.height / 2 + em * (figureCentreEm('Arimo') + 0.12 - baselineDropEm('Arimo')),
      3,
    );
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
      carriedFontSize: 12, fontFamily: 'Arimo', pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT,
    });
    const em = (12 / PAGE_HEIGHT) * 100;
    const baseline = placement.top + em * baselineDropEm('Arimo');
    const cellMiddle = boxedRun.top + boxedRun.height / 2;

    // SIGN-38: the digits' own ink is centred on the cell's middle
    // (figureCentreEm), not the font's whole em box - so the baseline sits
    // below the middle by exactly the digits' own ink-to-baseline distance,
    // not by half the em box (ascent+descent, which for Arimo puts the
    // digits' own centre 1.71pt off the cell's middle at 14pt in a 22pt
    // cell - the bug this fixes).
    expect(baseline).toBeGreaterThan(cellMiddle);
    expect(baseline).toBeLessThan(boxedRun.top + boxedRun.height);
    expect(baseline - cellMiddle).toBeCloseTo(em * figureCentreEm('Arimo'), 3);
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

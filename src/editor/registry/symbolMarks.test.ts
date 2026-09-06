import { describe, expect, it } from 'vitest';
import type { SymbolMark } from '../model/editorModel.ts';
import { DESIGN_BOX, markGeometry, markInkExtent, markPathData } from './symbolMarks.ts';
import { placeSymbolOnRegion } from './symbol.ts';

const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;

// A 6.6pt checkbox on the health declaration, as the detector reports it.
const CHECKBOX = { left: 52.377, top: 42.266, width: 1.113, height: 0.784 };

describe('markInkExtent', () => {
  it('counts the round cap, which really does put ink past the line', () => {
    // The cross runs 4 to 20 at thickness 3, so its ink runs 2.5 to 21.5.
    const ink = markInkExtent('x');
    expect(ink.x0).toBe(2.5);
    expect(ink.x1).toBe(21.5);
    expect(ink.width).toBe(19);
  });

  it('shows the cross inking only 19 of its 24 units', () => {
    // Which is why an element box laid exactly over a printed square draws a
    // mark a fifth too small for it.
    expect(markInkExtent('x').width / DESIGN_BOX).toBeCloseTo(0.79, 2);
  });

  it('shows the check sitting half a unit high in its own box', () => {
    // No amount of centring the *box* fixes this; only working from the ink.
    expect(markInkExtent('check').centerY).toBe(11.5);
    expect(markInkExtent('check').centerX).toBe(12);
  });

  it('measures the dot from its radius', () => {
    expect(markInkExtent('dot')).toMatchObject({ width: 16, height: 16, centerX: 12, centerY: 12 });
  });

  it('falls back to the check for an unknown mark', () => {
    expect(markGeometry(undefined)).toBe(markGeometry('check'));
  });
});

describe('markPathData', () => {
  it('draws the cross as two crossing strokes', () => {
    expect(markPathData('x')).toBe('M4 4L20 20M20 4L4 20');
  });

  it('draws the check as one polyline', () => {
    expect(markPathData('check')).toBe('M4 12L9 17L20 6');
  });
});

describe('placeSymbolOnRegion', () => {
  const place = (mark: SymbolMark | undefined) => placeSymbolOnRegion(CHECKBOX, mark, {
    pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT,
  });

  it('sizes the element so the mark inks the printed square, not its own box', () => {
    // The detected square is 6.626 x 6.601pt - a rectangle by a fraction of a
    // point, because its two percentages are of different page dimensions. The
    // mark scales uniformly, so it fills the tighter axis exactly.
    const placed = place('x');
    const ink = markInkExtent('x');
    const inkHeightPoints = ((ink.height / DESIGN_BOX) * placed.height / 100) * PAGE_HEIGHT;
    const squareHeightPoints = (CHECKBOX.height / 100) * PAGE_HEIGHT;
    expect(inkHeightPoints).toBeCloseTo(squareHeightPoints, 6);

    // ...and that is a fifth bigger than laying the element box over the square,
    // which is what drew the mark too small for it.
    expect(placed.width).toBeGreaterThan(CHECKBOX.width * 1.2);
  });

  it('centres the ink on the square, not the element box', () => {
    const placed = place('x');
    const inkCentre = placed.left + (markInkExtent('x').centerX / DESIGN_BOX) * placed.width;
    expect(inkCentre).toBeCloseTo(CHECKBOX.left + CHECKBOX.width / 2, 6);
  });

  it('centres a check too, despite its ink sitting high in its own box', () => {
    const placed = place('check');
    const inkCentreY = placed.top + (markInkExtent('check').centerY / DESIGN_BOX) * placed.height;
    expect(inkCentreY).toBeCloseTo(CHECKBOX.top + CHECKBOX.height / 2, 6);
  });

  it('scales uniformly, so a check is never stretched square', () => {
    // A check is naturally wider than it is tall; filling both axes would
    // distort it. It scales by whichever axis runs out first instead.
    const placed = place('check');
    const widthPoints = (placed.width / 100) * PAGE_WIDTH;
    const heightPoints = (placed.height / 100) * PAGE_HEIGHT;
    expect(widthPoints).toBeCloseTo(heightPoints, 6);
  });

  it('never lets the mark overflow the square', () => {
    const placed = place('check');
    const ink = markInkExtent('check');
    const inkWidth = (ink.width / DESIGN_BOX) * placed.width;
    const inkHeight = (ink.height / DESIGN_BOX) * placed.height;
    expect(inkWidth).toBeLessThanOrEqual(CHECKBOX.width + 1e-9);
    expect(inkHeight).toBeLessThanOrEqual(CHECKBOX.height + 1e-9);
  });

  it('returns the region unchanged rather than dividing by zero', () => {
    expect(placeSymbolOnRegion({ ...CHECKBOX, width: 0 }, 'x', {
      pageWidthPoints: PAGE_WIDTH, pageHeightPoints: PAGE_HEIGHT,
    })).toMatchObject({ left: CHECKBOX.left, top: CHECKBOX.top });
  });
});

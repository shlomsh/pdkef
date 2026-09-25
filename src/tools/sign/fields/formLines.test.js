import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import { detectLineCandidates } from './formLines.js';

// A 100x100pt page makes the PDF-point <-> page-percent arithmetic trivial, same convention as
// formCells.test.js: percent x equals PDF x, and percent top equals `100 - PDF y`.
const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0 });

/** A bare horizontal rule, PDF points (y up). */
function line({ y, x0, x1 }) {
  return { horizontals: [{ y, x0, x1 }], verticals: [], rects: [] };
}

function mergeInk(...pages) {
  return {
    horizontals: pages.flatMap((p) => p.horizontals),
    verticals: pages.flatMap((p) => p.verticals),
    rects: pages.flatMap((p) => p.rects),
  };
}

/** A page-percent text run, matching formCells.test.js's own `text()` helper shape. */
function text(str, { left, top, width, height = 6 }) {
  return { str, left, top, width, height };
}

/** The caption formCells.test.js's convention puts directly under a rule at PDF y=50, from
 * x0=10: PDF y0=40, y1=46 (gap 4pt under the line) -> percent top=54, height=6. */
function captionBelow(str, { x0 = 10, width = 30 } = {}) {
  return text(str, { left: x0, top: 54, width });
}

describe('detectLineCandidates', () => {
  it('finds a captioned signature line', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    const [field] = detectLineCandidates(ink, geometry, 0, [captionBelow('Signature')]);
    expect(field.kind).toBe('signature');
    expect(field.label).toBe('Signature');
    // The published region is the writing area above the line: PDF y 50..72 -> percent top
    // 100-72=28, height 22.
    expect(field.left).toBeCloseTo(10, 5);
    expect(field.top).toBeCloseTo(28, 5);
    expect(field.width).toBeCloseTo(80, 5);
    expect(field.height).toBeCloseTo(22, 5);
  });

  it('finds a captioned date line', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    const [field] = detectLineCandidates(ink, geometry, 0, [captionBelow('Date')]);
    expect(field.kind).toBe('date');
  });

  it('finds an uncaptioned rule as nothing', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    expect(detectLineCandidates(ink, geometry, 0, [])).toEqual([]);
  });

  it('drops a rule that is the top or bottom edge of a box', () => {
    // A box: rule at y=50 (the one under test, captioned so only the box exclusion is at play),
    // a second rule at y=90 (the box's top), and verticals closing both ends.
    const ink = mergeInk(
      line({ y: 50, x0: 10, x1: 90 }),
      { horizontals: [{ y: 90, x0: 10, x1: 90 }], verticals: [], rects: [] },
      { horizontals: [], verticals: [{ x: 10, y0: 50, y1: 90 }, { x: 90, y0: 50, y1: 90 }], rects: [] },
    );
    expect(detectLineCandidates(ink, geometry, 0, [captionBelow('Signature')])).toEqual([]);
  });

  it('drops a rule with text written above it', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    // Some unrelated print in the 22pt band above the line (PDF y 50..72): a heading at y0=55,
    // y1=60, well inside the band and overlapping the line's x-span.
    const above = text('Please fill in below', { left: 10, top: 40, width: 40 });
    expect(detectLineCandidates(ink, geometry, 0, [captionBelow('Signature'), above])).toEqual([]);
  });

  it('drops a caption under the line that is not a keyword', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    expect(detectLineCandidates(ink, geometry, 0, [captionBelow('Employee')])).toEqual([]);
  });

  it('finds a Hebrew signature caption, construct state included', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    // חתימת (construct state, "signature-of-") does not contain the literal string חתימה.
    const [field] = detectLineCandidates(ink, geometry, 0, [captionBelow('חתימת העובד')]);
    expect(field.kind).toBe('signature');
  });

  it('finds a Hebrew date caption', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    const [field] = detectLineCandidates(ink, geometry, 0, [captionBelow('תאריך')]);
    expect(field.kind).toBe('date');
  });

  it('finds a caption to the line\'s left', () => {
    // A short line from x=40 to x=100 (length 60, right at the floor), captioned "Date:" ending
    // at x=38 (gap 2pt to the line's start), on the line's own baseline (PDF y0 close to y=50).
    const ink = line({ y: 50, x0: 40, x1: 100 });
    const caption = text('Date:', { left: 10, top: 50, width: 28, height: 3 });
    const [field] = detectLineCandidates(ink, geometry, 0, [caption]);
    expect(field.kind).toBe('date');
    expect(field.label).toBe('Date:');
  });

  it('drops a rule shorter than the length floor', () => {
    const ink = line({ y: 50, x0: 10, x1: 65 }); // 55pt, under MIN_LINE_LENGTH
    expect(detectLineCandidates(ink, geometry, 0, [captionBelow('Signature', { width: 30 })])).toEqual([]);
  });

  it('never republishes ground an earlier detector already claimed', () => {
    const ink = line({ y: 50, x0: 10, x1: 90 });
    const existing = [{ left: 10, top: 28, width: 80, height: 22 }]; // the exact region this line would publish
    expect(detectLineCandidates(ink, geometry, 0, [captionBelow('Signature')], existing)).toEqual([]);
  });
});

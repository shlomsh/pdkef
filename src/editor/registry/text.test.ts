import { describe, expect, it, vi } from 'vitest';
import { applyCombWidth, applyTextPosition, applyTextResize, combWidthFloor, textDefinition } from './text.ts';

describe('applyCombWidth', () => {
  const start = { left: 20, width: 30 };

  it('widens from the free edge without moving the anchor', () => {
    expect(applyCombWidth({ handle: 'right', delta: { x: 10 }, start, isRtl: false, minWidth: 2 }))
      .toEqual({ left: 20, width: 40, collapsed: false });
  });

  it('moves the anchor when the anchored edge is dragged', () => {
    expect(applyCombWidth({ handle: 'left', delta: { x: 5 }, start, isRtl: false, minWidth: 2 }))
      .toEqual({ left: 25, width: 25, collapsed: false });
  });

  it('mirrors both roles in RTL, where `left` is the box’s right edge', () => {
    expect(applyCombWidth({ handle: 'left', delta: { x: 10 }, start, isRtl: true, minWidth: 2 }))
      .toEqual({ left: 20, width: 20, collapsed: false });
    expect(applyCombWidth({ handle: 'right', delta: { x: 10 }, start, isRtl: true, minWidth: 2 }))
      .toEqual({ left: 30, width: 40, collapsed: false });
  });

  it('parks the anchor at the floor instead of sliding it past a box that stopped shrinking', () => {
    expect(applyCombWidth({ handle: 'left', delta: { x: 999 }, start, isRtl: false, minWidth: 2 }))
      .toEqual({ left: 48, width: 2, collapsed: true });
  });

  describe('collapsed: dragging the span past its floor signals "close this comb"', () => {
    it('is false right up to the floor, so an ordinary shrink never triggers it', () => {
      // Raw width lands exactly on minWidth - clamping never even engages.
      expect(applyCombWidth({ handle: 'left', delta: { x: 28 }, start, isRtl: false, minWidth: 2 }).collapsed)
        .toBe(false);
    });

    it('is true the instant the raw (pre-clamp) width would go past the floor, from either handle', () => {
      expect(applyCombWidth({ handle: 'left', delta: { x: 28.01 }, start, isRtl: false, minWidth: 2 }).collapsed)
        .toBe(true);
      // The free-edge handle can collapse it too - it isn't special to the
      // anchored edge.
      expect(applyCombWidth({ handle: 'right', delta: { x: -28.01 }, start, isRtl: false, minWidth: 2 }).collapsed)
        .toBe(true);
    });

    it('is not a proximity check against any particular width - only the fixed, predictable floor matters', () => {
      // A wide starting span dragged down to *near* (but not past) the floor
      // must not collapse just because it's numerically close to something -
      // there is no "something" here, only the floor itself.
      expect(applyCombWidth({ handle: 'left', delta: { x: 500 - 2.01 }, start: { left: 0, width: 500 }, isRtl: false, minWidth: 2 }).collapsed)
        .toBe(false);
    });
  });
});

describe('combWidthFloor', () => {
  const text = (over = {}) => ({ id: 't', type: 'text', pageIndex: 0, left: 0, top: 0, text: '0382', fontSize: 12, ...over }) as never;

  it('sits within reach of the box’s own text width, so shrinking one back is a gesture and not an errand', () => {
    // 4 cells x 12px x 0.6em = 28.8px of a 600px page. The same four digits set
    // at 12px measure roughly 27px, so the floor lands just the far side of
    // "as narrow as this text has any business being" - which is where someone
    // shrinking a comb back down naturally stops.
    expect(combWidthFloor({ element: text(), fontSizePx: 12, pageWidthPx: 600 })).toBeCloseTo(4.8);
  });

  it('follows the cells rather than the page, because that is what decides when a comb has stopped being one', () => {
    // Twice the cells, or twice the type size, needs twice the span before the
    // characters would start colliding - a flat percentage could not say that.
    expect(combWidthFloor({ element: text({ combCells: 8 }), fontSizePx: 12, pageWidthPx: 600 })).toBeCloseTo(9.6);
    expect(combWidthFloor({ element: text(), fontSizePx: 24, pageWidthPx: 600 })).toBeCloseTo(9.6);
  });

  it('never drops below the absolute floor that keeps the box grabbable at all', () => {
    expect(combWidthFloor({ element: text({ text: '7' }), fontSizePx: 1, pageWidthPx: 600 })).toBe(2);
    // No layout to measure yet (an unrendered page) - fall back rather than
    // return a garbage percentage derived from a zero width.
    expect(combWidthFloor({ element: text(), fontSizePx: 12, pageWidthPx: 0 })).toBe(2);
  });
});

describe('applyTextResize', () => {
  it('scales by the measured box diagonal and clamps the font size', () => {
    expect(applyTextResize({ startFontSize: 12, delta: { x: 50, y: 0 }, startRect: { width: 100, height: 50 }, fallbackDeltaPoints: 0 }))
      .toEqual({ fontSize: 17 });
    expect(applyTextResize({ startFontSize: 12, delta: { x: -10_000, y: 0 }, startRect: { width: 100, height: 50 }, fallbackDeltaPoints: 0 }))
      .toEqual({ fontSize: 6 });
  });

  it('uses the point-based fallback when no measured box is available', () => {
    expect(applyTextResize({ startFontSize: 12, delta: { x: 0, y: 0 }, startRect: null, fallbackDeltaPoints: 20 }))
      .toEqual({ fontSize: 16 });
  });

  it('preserves the appropriate text anchor for LTR and RTL resizing', () => {
    expect(applyTextPosition({ start: { left: 20, top: 30 }, startSize: { width: 10, height: 5 }, nextSize: { width: 15, height: 8 }, isLeftHandle: true, isTopHandle: true, isRtl: false }))
      .toEqual({ left: 15, top: 27 });
    expect(applyTextPosition({ start: { left: 20, top: 30 }, startSize: { width: 10, height: 5 }, nextSize: { width: 15, height: 8 }, isLeftHandle: false, isTopHandle: false, isRtl: true }))
      .toEqual({ left: 25, top: 30 });
  });
});

describe('text serialize font choice', () => {
  async function serializeWith(element: Record<string, unknown>) {
    const requested: string[] = [];
    const loadCustomFont = vi.fn(async (family: string) => {
      requested.push(family);
      return { widthOfTextAtSize: () => 42 };
    });
    const page = { drawText: vi.fn() };
    await textDefinition.serialize(element as never, {
      page, pdfWidth: 612, pdfHeight: 792, pdfX: 100, pdfY: 700,
      loadCustomFont, baselineOffset: () => 0.85,
    } as never);
    return { requested, page };
  }

  const base = { type: 'text', id: 't1', pageIndex: 0, left: 10, top: 10, fontSize: 12, fontWeight: 'normal', fontStyle: 'normal', color: '#000000' };

  // The editor renders the substituted family too (TextNode), so embedding the
  // picked one here is exactly how Hebrew turned into empty rectangles.
  it('embeds the Hebrew stand-in when the picked font has no Hebrew glyphs', async () => {
    const { requested } = await serializeWith({ ...base, fontFamily: 'Caveat', text: 'שלומי' });
    expect(requested[0]).toBe('Gveret Levin');
  });

  it('embeds the picked font when it can render the text', async () => {
    const hebrew = await serializeWith({ ...base, fontFamily: 'Heebo', text: 'שלומי' });
    expect(hebrew.requested[0]).toBe('Heebo');
    const latin = await serializeWith({ ...base, fontFamily: 'Caveat', text: 'Shlomi' });
    expect(latin.requested[0]).toBe('Caveat');
  });

  it('draws nothing at all for a genuinely empty text value', async () => {
    const { page, requested } = await serializeWith({ ...base, fontFamily: 'Caveat', text: '' });
    expect(requested).toEqual([]);
    expect(page.drawText).not.toHaveBeenCalled();
  });

  it('keeps leading/trailing spaces and blank physical lines in export layout', async () => {
    const { page } = await serializeWith({ ...base, fontFamily: 'Arimo', text: ' lead \n\ntrail ' });
    // The fallback font in this focused serializer harness leaves text whole,
    // which makes the exact strings and their baselines observable without
    // duplicating fontkit's shaping implementation in the test.
    expect(page.drawText.mock.calls.map(([value]) => value)).toEqual([' lead ', 'trail ']);
    const [first, second] = page.drawText.mock.calls.map(([, options]) => options.y);
    // One blank line remains between the two inked lines, so the baseline
    // advances twice at the shared 1.05em line height (12pt * 1.05 * 2).
    expect(first - second).toBeCloseTo(25.2);
  });
});

describe('comb serialize', () => {
  // A 10%-wide comb on a 612pt page is 61.2pt across; the stub font reports
  // every glyph as 42pt wide, so each x is its cell centre minus 21.
  async function serializeComb(element: Record<string, unknown>) {
    const page = { drawText: vi.fn() };
    await textDefinition.serialize(element as never, {
      page, pdfWidth: 612, pdfHeight: 792, pdfX: 61.2, pdfY: 700,
      loadCustomFont: async () => ({ widthOfTextAtSize: () => 42 }),
      baselineOffset: () => 0.85,
    } as never);
    return page.drawText.mock.calls.map(([char, options]) => [char, Number(options.x.toFixed(3))]);
  }

  const base = {
    type: 'text', id: 't1', pageIndex: 0, left: 10, top: 10, fontSize: 12,
    fontWeight: 'normal', fontStyle: 'normal', color: '#000000', fontFamily: 'Arimo',
    width: 10, // width alone is what makes a text element a comb - see comb.js's isComb
  };

  it('draws one character per cell, each centred on its cell rather than by font advance', () => {
    // Cell centres for 4 cells across 61.2pt starting at x=61.2: 68.85, 84.15, 99.45, 114.75.
    return expect(serializeComb({ ...base, text: '2705' })).resolves.toEqual([
      ['2', 47.85], ['7', 63.15], ['0', 78.45], ['5', 93.75],
    ]);
  });

  it('keeps the pitch fixed when cells are left blank, instead of respreading the text', async () => {
    const filled = await serializeComb({ ...base, text: '27', combCells: 4 });
    const full = await serializeComb({ ...base, text: '2705' });
    expect(filled).toEqual(full.slice(0, 2));
  });

  it('measures RTL from the anchored right edge, with reading order mirrored so the first character lands there', async () => {
    // A comb has no genuine RTL use case in practice - every real one here is
    // digits/dates, which now always render LTR (see signHelpers.js) - but the
    // export math still needs proving for whatever does carry RTL content.
    const [[firstChar, firstX], [, secondX]] = await serializeComb({ ...base, text: 'שר', textDirection: 'rtl' });
    // The box occupies 0..61.2pt (anchored at its right edge, pdfX=61.2). The
    // *first* character typed ('ש') must land nearest that right edge, not in
    // whichever cell happens to be physically first - a comb has no growing
    // edge to anchor to the way plain RTL text does, but the reading order
    // still has to agree with it. Cell centres: 45.9 (ש's cell) then 15.3.
    expect(firstChar).toBe('ש');
    expect(firstX).toBeCloseTo(24.9);
    expect(secondX).toBeCloseTo(-5.7);
  });

  it('skips blank cells without shifting the ones after them', async () => {
    expect(await serializeComb({ ...base, text: '2 05' })).toEqual([
      ['2', 47.85], ['0', 78.45], ['5', 93.75],
    ]);
  });
});

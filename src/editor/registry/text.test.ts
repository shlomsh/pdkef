import { describe, expect, it, vi } from 'vitest';
import { applyCombWidth, applyTextPosition, applyTextResize, textDefinition } from './text.ts';

describe('applyCombWidth', () => {
  const start = { left: 20, width: 30 };

  it('widens from the free edge without moving the anchor', () => {
    expect(applyCombWidth({ handle: 'right', delta: { x: 10 }, start, isRtl: false, minWidth: 2 }))
      .toEqual({ left: 20, width: 40 });
  });

  it('moves the anchor when the anchored edge is dragged', () => {
    expect(applyCombWidth({ handle: 'left', delta: { x: 5 }, start, isRtl: false, minWidth: 2 }))
      .toEqual({ left: 25, width: 25 });
  });

  it('mirrors both roles in RTL, where `left` is the box’s right edge', () => {
    expect(applyCombWidth({ handle: 'left', delta: { x: 10 }, start, isRtl: true, minWidth: 2 }))
      .toEqual({ left: 20, width: 20 });
    expect(applyCombWidth({ handle: 'right', delta: { x: 10 }, start, isRtl: true, minWidth: 2 }))
      .toEqual({ left: 30, width: 40 });
  });

  it('parks the anchor at the floor instead of sliding it past a box that stopped shrinking', () => {
    expect(applyCombWidth({ handle: 'left', delta: { x: 999 }, start, isRtl: false, minWidth: 2 }))
      .toEqual({ left: 48, width: 2 });
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

  it('draws nothing at all for empty text', async () => {
    const { page, requested } = await serializeWith({ ...base, fontFamily: 'Caveat', text: '   ' });
    expect(requested).toEqual([]);
    expect(page.drawText).not.toHaveBeenCalled();
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
    comb: true, width: 10,
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

  it('measures RTL from the anchored right edge', async () => {
    const [[, firstX]] = await serializeComb({ ...base, text: '27', textDirection: 'rtl' });
    // The box now occupies 0..61.2 rather than 61.2..122.4, so the first cell
    // centre is 15.3 and the glyph starts 21 to its left.
    expect(firstX).toBeCloseTo(-5.7);
  });

  it('skips blank cells without shifting the ones after them', async () => {
    expect(await serializeComb({ ...base, text: '2 05' })).toEqual([
      ['2', 47.85], ['0', 78.45], ['5', 93.75],
    ]);
  });
});

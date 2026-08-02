import { describe, expect, it, vi } from 'vitest';
import { applyTextPosition, applyTextResize, textDefinition } from './text.ts';

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

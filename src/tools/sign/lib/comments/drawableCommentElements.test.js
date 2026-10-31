import { describe, expect, it } from 'vitest';
import { drawableCommentElements } from './drawableCommentElements.ts';

const el = (text) => ({ id: 'c', type: 'text', pageIndex: 0, left: 0, top: 0, text, fontSize: 11, fontFamily: 'Arimo', fontWeight: 'normal', color: '#000' });
// A stand-in for an embedded font, reached the way textMetrics.ts reaches pdf-lib's: it has a glyph for
// every code point below the emoji planes, as Arimo does for this test's text.
const font = { embedder: { font: { unitsPerEm: 1000, hasGlyphForCodePoint: (cp) => cp < 0x1f000 } } };

describe('drawableCommentElements', () => {
  it('drops uncovered characters, skips emptied lines and unloadable fonts', async () => {
    const out = await drawableCommentElements([el('great \u{1F44D}'), el('\u{1F44D}')], async () => font);
    expect(out.map((e) => e.text)).toEqual(['great ']);
    expect(await drawableCommentElements([el('great')], async () => null)).toEqual([]);
  });
});

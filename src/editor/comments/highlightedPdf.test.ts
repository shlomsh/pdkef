import { describe, expect, it } from 'vitest';
import type { CommentElement, HighlightElement } from '../model/editorModel.ts';
import { buildHighlightedPdf, YELLOW } from '../../test/support/highlightedPdf.js';
import { importStandardAnnotations } from './importAnnotations.ts';

const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const LINE = 'A line of text a student would highlight';

describe('buildHighlightedPdf: Sign reads the fixture back through importAnnotations', () => {
  it('turns a plain highlight into a yellow highlight over the named line and strips the annotation', async () => {
    const bytes = await buildHighlightedPdf({ lines: [{ text: LINE, y: 700 }], highlights: [{ line: LINE }] });
    const { elements, bytes: stripped } = await importStandardAnnotations(toBuffer(bytes));
    expect(elements).toHaveLength(1);
    const h = elements[0] as HighlightElement;
    expect(h).toMatchObject({ type: 'highlight', pageIndex: 0, color: '#FFF34D' });
    expect(h.left).toBeCloseTo((72 / 612) * 100, 0);
    expect(h.top).toBeGreaterThan(8);
    expect(h.top).toBeLessThan(14);
    expect(YELLOW).toHaveLength(3);
    expect(stripped.byteLength).not.toBe(bytes.byteLength);
  });

  it('turns /Contents, /M and a closed /Popup into a comment anchored to the highlight', async () => {
    const bytes = await buildHighlightedPdf({
      lines: [{ text: LINE, y: 700 }],
      highlights: [{ line: LINE, contents: 'Check this', modified: Date.UTC(2026, 10, 1, 9, 0, 0), popup: true }],
    });
    const { elements } = await importStandardAnnotations(toBuffer(bytes));
    expect(elements.map((e) => e.type)).toEqual(['highlight', 'comment']);
    const c = elements[1] as CommentElement;
    expect(c).toMatchObject({ comment: 'Check this', commentedAt: Date.UTC(2026, 10, 1, 9, 0, 0), anchor: { kind: 'element', elementId: elements[0].id } });
  });
});

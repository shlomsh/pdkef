import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { readBackAnnotations } from '#editor/comments/readBack.ts';
import { exportHighlighted } from './highlightedPdf.ts';

const toBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

async function twoPagePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.addPage([612, 792]);
  return toBuffer(await doc.save());
}

const plain: HighlightElement = {
  id: 'h-plain', type: 'highlight', pageIndex: 0, left: 12, top: 20, width: 40, height: 3,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const underline: HighlightElement = {
  id: 'h-underline', type: 'highlight', pageIndex: 1, left: 20, top: 40, width: 50, height: 6,
  color: '#7FDBFF', style: 'underline', opacity: 0.5,
  bands: [{ left: 0, top: 0, width: 100, height: 45 }, { left: 10, top: 55, width: 60, height: 45 }],
};

/** A band's page-percent rect, whatever box it is measured against. */
const absolute = (h: HighlightElement) => h.bands.map((b) => ({
  left: h.left + (b.left / 100) * h.width, top: h.top + (b.top / 100) * h.height,
  width: (b.width / 100) * h.width, height: (b.height / 100) * h.height,
}));

describe('exportHighlighted', () => {
  it('writes highlights that read back with the same color, style, opacity, page and bands', async () => {
    const out = await exportHighlighted(await twoPagePdf(), [plain, underline] as EditorElement[]);
    const { elements } = await readBackAnnotations(toBuffer(out));
    const back = elements.filter((e): e is HighlightElement => e.type === 'highlight');
    expect(back).toHaveLength(2);
    for (const original of [plain, underline]) {
      const found = back.find((e) => e.pageIndex === original.pageIndex);
      expect(found).toBeDefined();
      expect(found?.color).toBe(original.color);
      expect(found?.style).toBe(original.style);
      expect(found?.opacity).toBe(original.opacity);
      const want = absolute(original);
      const got = absolute(found as HighlightElement);
      expect(got).toHaveLength(want.length);
      want.forEach((w, i) => {
        for (const key of ['left', 'top', 'width', 'height'] as const) expect(Math.abs(got[i][key] - w[key])).toBeLessThan(0.5);
      });
    }
  });
});

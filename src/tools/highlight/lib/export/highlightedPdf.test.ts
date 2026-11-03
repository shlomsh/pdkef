import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, degrees } from '@cantoo/pdf-lib';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
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

  describe('pageTurns', () => {
    const rotations = async (out: Uint8Array) => (await PDFDocument.load(out)).getPages().map((p) => p.getRotation().angle);

    it('adds the turn to the page rotation, mod 360, and leaves other pages alone', async () => {
      const src = await PDFDocument.create();
      src.addPage([612, 792]);
      src.addPage([612, 792]).setRotation(degrees(270));
      const bytes = toBuffer(await src.save());
      expect(await rotations(await exportHighlighted(bytes, [], { 0: 1, 1: 1 }))).toEqual([90, 0]);
      expect(await rotations(await exportHighlighted(bytes, [], {}))).toEqual([0, 270]);
      expect(await rotations(await exportHighlighted(bytes, []))).toEqual([0, 270]);
    });

    it('strokes a turned page\'s underline along the text bottom, which is the displayed left edge', async () => {
      const wide: HighlightElement = { ...underline, pageIndex: 0, bands: [{ left: 0, top: 0, width: 100, height: 100 }] };
      const stroke = async (turns: Record<number, 1>) => {
        const doc = await PDFDocument.load(await exportHighlighted(await twoPagePdf(), [wide] as EditorElement[], turns));
        const annot = doc.context.lookup(doc.getPage(0).node.Annots()!.get(0)) as PDFDict;
        const ap = doc.context.lookup(annot.get(PDFName.of('AP'))) as PDFDict;
        const text = new TextDecoder().decode((doc.context.lookup(ap.get(PDFName.of('N'))) as any).getContents());
        const [x1, y1, x2, y2] = text.match(/([\d.-]+) ([\d.-]+) m ([\d.-]+) ([\d.-]+) l S/)!.slice(1).map(Number);
        return { dx: Math.abs(x2 - x1), dy: Math.abs(y2 - y1) };
      };
      // The page is turned 90 degrees, so the displayed left edge is the raw bottom edge: level in raw space.
      expect((await stroke({ 0: 1 })).dy).toBeLessThan(0.01);
      // Unturned, the displayed bottom is the raw bottom: also level.
      expect((await stroke({} as never)).dy).toBeLessThan(0.01);
    });

    it('keeps a highlight on the same text in the turned page', async () => {
      const out = await exportHighlighted(await twoPagePdf(), [plain] as EditorElement[], { 0: 1 });
      const { elements } = await readBackAnnotations(toBuffer(out));
      const back = elements.find((e): e is HighlightElement => e.type === 'highlight');
      expect(back).toBeDefined();
      const want = absolute(plain);
      const got = absolute(back as HighlightElement);
      expect(got).toHaveLength(want.length);
      want.forEach((w, i) => {
        for (const key of ['left', 'top', 'width', 'height'] as const) expect(Math.abs(got[i][key] - w[key])).toBeLessThan(0.5);
      });
    });
  });

  describe('pencil, sketch and comments', () => {
    // A 612 x 792 page: a band 20% to 60% across, 10% to 14% down.
    const base: HighlightElement = {
      id: 'mark', type: 'highlight', pageIndex: 0, left: 20, top: 10, width: 40, height: 4,
      color: '#1463FF', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
    };
    const band = { left: 122.4, right: 367.2, top: 792 * 0.9, bottom: 792 * 0.86 };

    const nums = (doc: PDFDocument, array: unknown) => (array as PDFArray | undefined)?.asArray().map((n) => (doc.context.lookup(n) as PDFNumber).asNumber()) ?? [];
    const rgb = ['0.078', '0.388', '1'];

    /** Every annotation of page one, read straight off the saved file. */
    async function annotations(elements: EditorElement[]) {
      const doc = await PDFDocument.load(await exportHighlighted(await twoPagePdf(), elements));
      const annots = doc.getPage(0).node.Annots()!;
      return annots.asArray().map((ref) => {
        const dict = doc.context.lookup(ref) as PDFDict;
        const ap = dict.get(PDFName.of('AP')) && (doc.context.lookup(dict.get(PDFName.of('AP'))) as PDFDict);
        const stream = ap && (doc.context.lookup(ap.get(PDFName.of('N'))) as any);
        return {
          subtype: (dict.get(PDFName.of('Subtype')) as PDFName).toString(),
          style: dict.get(PDFName.of('PDkefStyle'))?.toString(),
          rect: nums(doc, dict.get(PDFName.of('Rect'))),
          color: nums(doc, dict.get(PDFName.of('C'))),
          flags: (dict.get(PDFName.of('F')) as PDFNumber | undefined)?.asNumber(),
          contents: (dict.get(PDFName.of('Contents')) as PDFHexString | undefined)?.decodeText(),
          content: stream ? new TextDecoder().decode(stream.getContents()) as string : '',
        };
      });
    }
    const colorOps = (content: string, op: 'rg' | 'RG') => (content.match(new RegExp(`([\\d.]+) ([\\d.]+) ([\\d.]+) ${op}`)) ?? []).slice(1).map((n) => String(Math.round(Number(n) * 1000) / 1000));

    /** Every coordinate pair the appearance's path operators (m, c) visit. */
    const pathPoints = (content: string) => {
      const points: number[][] = [];
      let pending: number[] = [];
      for (const token of content.split(/\s+/)) {
        if (/^-?[\d.]+$/.test(token)) pending.push(Number(token));
        else {
          if (token === 'm' || token === 'c') for (let i = 0; i + 1 < pending.length; i += 2) points.push([pending[i], pending[i + 1]]);
          pending = [];
        }
      }
      return points.filter(([x, y]) => x > 100 && y > 600);
    };
    const insideRect = (rect: number[], points: number[][]) => points.every(([x, y]) => x >= rect[0] && y >= rect[1] && x <= rect[2] && y <= rect[3]);

    it('exports a pencil mark as a standard highlight tagged Pencil, hatched in its color inside its band', async () => {
      const [annot, ...rest] = await annotations([{ ...base, style: 'pencil' }] as EditorElement[]);
      expect(rest).toHaveLength(0);
      expect(annot.subtype).toBe('/Highlight');
      expect(annot.style).toBe('/Pencil');
      expect(annot.color.map((n) => Math.round(n * 1000) / 1000)).toEqual([0.078, 0.388, 1]);
      // Stroked hatch lines (not filled quads) in the mark's color.
      expect(colorOps(annot.content, 'RG')).toEqual(rgb);
      expect(annot.content).toMatch(/ c /);
      expect(annot.content).toMatch(/ S$/m);
      expect(annot.content).not.toMatch(/ l h f/);
      // The annotation rectangle covers the band, padded by the hatch.
      const [x0, y0, x1, y1] = annot.rect;
      expect(x0).toBeLessThanOrEqual(band.left + 0.01);
      expect(y0).toBeLessThanOrEqual(band.bottom + 0.01);
      expect(x1).toBeGreaterThanOrEqual(band.right - 0.01);
      expect(y1).toBeGreaterThanOrEqual(band.top - 0.01);
      expect(pathPoints(annot.content).length).toBeGreaterThan(4);
      expect(insideRect(annot.rect, pathPoints(annot.content))).toBe(true);
    });

    it('exports a sketched mark as one filled hand-drawn path in its color, not as clean quads', async () => {
      const [annot] = await annotations([{ ...base, stroke: 'sketch' }] as EditorElement[]);
      expect(annot.subtype).toBe('/Highlight');
      expect(annot.style).toBeUndefined();
      expect(colorOps(annot.content, 'rg')).toEqual(rgb);
      expect(annot.content).toMatch(/ c /);
      expect(annot.content).toMatch(/ c h f$/m);
      expect(annot.content).not.toMatch(/ l h f/);
      const [x0, y0, x1, y1] = annot.rect;
      expect(x0).toBeLessThanOrEqual(band.left + 0.01);
      expect(y0).toBeLessThanOrEqual(band.bottom + 0.01);
      expect(x1).toBeGreaterThanOrEqual(band.right - 0.01);
      expect(y1).toBeGreaterThanOrEqual(band.top - 0.01);
      // The overshoot of the hand-drawn edge stays near the band.
      expect(x0).toBeGreaterThan(band.left - 20);
      expect(y1).toBeLessThan(band.top + 20);
      expect(pathPoints(annot.content).length).toBeGreaterThan(4);
      expect(insideRect(annot.rect, pathPoints(annot.content))).toBe(true);
    });

    it('puts the comment of a highlight in that highlight\'s own annotation, with a popup beside the passage', async () => {
      const note: CommentElement = {
        id: 'note', type: 'comment', pageIndex: 0, left: 20, top: 10, width: 40, height: 4, comment: 'check this figure',
        commentedAt: Date.UTC(2026, 10, 3), anchor: { kind: 'element', elementId: 'mark' },
      };
      const orphan: CommentElement = { ...note, id: 'orphan', comment: 'its mark was deleted', anchor: { kind: 'element', elementId: 'gone' } };
      const annots = await annotations([base, note, orphan] as EditorElement[]);
      // The note of a mark that no longer exists is not exported at all.
      expect(annots.map((a) => a.subtype)).toEqual(['/Highlight', '/Popup']);
      expect(annots[0].contents).toBe('check this figure');
      expect(annots[0].color.map((n) => Math.round(n * 1000) / 1000)).toEqual([0.078, 0.388, 1]);
      // The popup opens to the right of the band, level with its top.
      expect(annots[1].rect[0]).toBeCloseTo(band.right + 4, 1);
      expect(annots[1].rect[3]).toBeCloseTo(band.top, 1);
    });

    it('exports a comment pinned to a spot as an 18pt note centered there, and one on a passage as an unprinted transparent highlight', async () => {
      const pin: CommentElement = {
        id: 'pin', type: 'comment', pageIndex: 0, left: 50, top: 50, width: 2, height: 2, comment: 'pinned',
        anchor: { kind: 'point' },
      };
      const passage: CommentElement = {
        id: 'passage', type: 'comment', pageIndex: 0, left: 20, top: 10, width: 40, height: 4, comment: 'on the passage',
        anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] },
      };
      const [note, tint, popup] = await annotations([pin, passage] as EditorElement[]);
      expect(note.subtype).toBe('/Text');
      expect(note.contents).toBe('pinned');
      // The pin's box center: 51% across, 51% down a 612 x 792 page.
      const [x0, y0, x1, y1] = note.rect;
      expect([x1 - x0, y1 - y0]).toEqual([18, 18]);
      expect((x0 + x1) / 2).toBeCloseTo(612 * 0.51, 1);
      expect((y0 + y1) / 2).toBeCloseTo(792 * 0.49, 1);

      expect(tint.subtype).toBe('/Highlight');
      expect(tint.contents).toBe('on the passage');
      expect(tint.color).toEqual([]);
      expect(tint.flags).toBeUndefined();
      expect(tint.content).toBe('');
      expect(popup.subtype).toBe('/Popup');
    });
  });
});

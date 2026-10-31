import { describe, expect, it, vi } from 'vitest';
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, PDFRef, degrees,
} from '@cantoo/pdf-lib';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import { createPageGeometry } from '#editor/geometry/coords.ts';
import {
  annotationsToElements, importStandardAnnotations, parsePdfDate, type RawAnnotation, type RawPage,
} from './importAnnotations.ts';

const upright = createPageGeometry({ cropBox: { x: 0, y: 0, width: 200, height: 100 } });
const counter = () => { let n = 0; return () => `gen-${++n}`; };
// One line of text at x 20..120, y 40..50 (PDF space), quad order UL UR LL LR.
const QUAD = [20, 50, 120, 50, 20, 40, 120, 40];

const raw = (over: Partial<RawAnnotation>): RawAnnotation => ({ ref: {}, subtype: 'Highlight', rect: [20, 40, 120, 50], ...over });
const page = (annots: RawAnnotation[], geometry = upright, pageIndex = 0): RawPage => ({ pageIndex, geometry, annots });
const run = (pages: RawPage[]) => annotationsToElements(pages, counter());

describe('parsePdfDate', () => {
  it('reads UTC, offset and partial dates, and rejects junk', () => {
    expect(parsePdfDate("D:20260102030405Z")).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(parsePdfDate("D:20260102030405+02'00'")).toBe(Date.UTC(2026, 0, 2, 1, 4, 5));
    expect(parsePdfDate("D:20260102030405-05'30")).toBe(Date.UTC(2026, 0, 2, 8, 34, 5));
    expect(parsePdfDate('D:20260102')).toBe(Date.UTC(2026, 0, 2));
    expect(parsePdfDate('yesterday')).toBeUndefined();
    expect(parsePdfDate(undefined)).toBeUndefined();
  });
});

describe('annotationsToElements: highlights', () => {
  it('turns a colored highlight into a highlight element and removes the annotation', () => {
    const a = raw({ quadPoints: QUAD, color: [1, 0, 0.5], nm: 'hl-1' });
    const { elements, remove } = run([page([a])]);
    expect(elements).toHaveLength(1);
    const h = elements[0] as HighlightElement;
    expect(h).toMatchObject({ id: 'hl-1', type: 'highlight', pageIndex: 0, color: '#FF0080' });
    expect(h.left).toBeCloseTo(10);
    expect(h.top).toBeCloseTo(50);
    expect(h.width).toBeCloseTo(50);
    expect(h.height).toBeCloseTo(10);
    expect(h.bands).toHaveLength(1);
    expect(h.bands[0]).toMatchObject({ left: 0, top: 0, width: 100, height: 100 });
    expect(h.direction).toBeUndefined();
    expect(remove.has(a)).toBe(true);
  });

  it('uses the default color when /C is absent and the union box for several quads', () => {
    const a = raw({ quadPoints: [...QUAD, 20, 30, 70, 30, 20, 20, 70, 20] });
    const [h] = run([page([a])]).elements as HighlightElement[];
    expect(h.color).toBe('#FFF34D');
    expect(h.bands).toHaveLength(2);
    expect(h.top).toBeCloseTo(50);
    expect(h.height).toBeCloseTo(30);
    expect(h.bands[0]).toMatchObject({ top: 0 });
    expect(h.bands[0].height).toBeCloseTo(100 / 3);
    expect(h.bands[1].top).toBeCloseTo(200 / 3);
    expect(h.bands[1].width).toBeCloseTo(50);
  });

  it('adds an element-anchored comment right after the highlight when it has contents', () => {
    const a = raw({ quadPoints: QUAD, nm: 'hl-1', contents: 'Check this', m: 'D:20260102030405Z' });
    const { elements } = run([page([a])]);
    expect(elements.map((e) => e.id)).toEqual(['hl-1', 'hl-1-comment']);
    const c = elements[1] as CommentElement;
    expect(c).toMatchObject({
      type: 'comment', pageIndex: 0, comment: 'Check this', commentedAt: Date.UTC(2026, 0, 2, 3, 4, 5),
      anchor: { kind: 'element', elementId: 'hl-1' },
    });
    expect(c.left).toBe((elements[0] as HighlightElement).left);
  });

  it('makes a transparent highlight with contents a passage comment', () => {
    const a = raw({ quadPoints: QUAD, color: [], contents: 'Note' });
    const { elements, remove } = run([page([a])]);
    expect(elements).toHaveLength(1);
    const c = elements[0] as CommentElement;
    expect(c).toMatchObject({ type: 'comment', comment: 'Note', anchor: { kind: 'passage' } });
    expect(c.anchor.kind === 'passage' && c.anchor.bands).toHaveLength(1);
    expect(remove.has(a)).toBe(true);
  });

  it('leaves a transparent blank highlight, a quad-less highlight and a reply highlight alone', () => {
    const blank = raw({ quadPoints: QUAD, color: [], contents: '  ' });
    const noQuads = raw({});
    const reply = raw({ quadPoints: QUAD, irt: {} });
    const { elements, remove } = run([page([blank, noQuads, reply])]);
    expect(elements).toEqual([]);
    expect(remove.size).toBe(0);
  });

  it('maps quads on a rotated page', () => {
    const rotated = createPageGeometry({ cropBox: { x: 0, y: 0, width: 200, height: 100 }, rotation: 90 });
    const [h] = run([page([raw({ quadPoints: QUAD })], rotated)]).elements as HighlightElement[];
    // 90 degrees: viewport is 100 wide x 200 tall; x grows with PDF y, y grows with PDF x.
    expect(h.left).toBeCloseTo(40);
    expect(h.top).toBeCloseTo(10);
    expect(h.width).toBeCloseTo(10);
    expect(h.height).toBeCloseTo(50);
  });

  it('maps quads on a crop box with a non-zero origin', () => {
    const cropped = createPageGeometry({ cropBox: { x: 10, y: 20, width: 200, height: 100 } });
    const [h] = run([page([raw({ quadPoints: QUAD })], cropped)]).elements as HighlightElement[];
    expect(h.left).toBeCloseTo(5);
    expect(h.top).toBeCloseTo(70);
    expect(h.width).toBeCloseTo(50);
  });
});

describe('annotationsToElements: notes', () => {
  it('turns a /Text note into a pin centered on its rect', () => {
    const a = raw({ subtype: 'Text', rect: [90, 45, 110, 55], contents: 'Hi' });
    const { elements, remove } = run([page([a])]);
    const c = elements[0] as CommentElement;
    expect(c).toMatchObject({ type: 'comment', comment: 'Hi', anchor: { kind: 'point' }, width: 2.4 });
    expect(c.left + c.width / 2).toBeCloseTo(50);
    expect(c.top + c.height / 2).toBeCloseTo(50);
    expect(remove.has(a)).toBe(true);
  });

  it('leaves blank notes and replies alone', () => {
    const blank = raw({ subtype: 'Text', contents: '' });
    const reply = raw({ subtype: 'Text', contents: 'Re', irt: {} });
    const { elements, remove } = run([page([blank, reply])]);
    expect(elements).toEqual([]);
    expect(remove.size).toBe(0);
  });
});

describe('annotationsToElements: cleanup and ids', () => {
  it('removes the popup of an imported annotation and keeps other popups', () => {
    const ref = {};
    const hl = raw({ ref, quadPoints: QUAD, contents: 'x' });
    const popup = raw({ subtype: 'Popup', parent: ref });
    const strayPopup = raw({ subtype: 'Popup', parent: {} });
    const { remove } = run([page([hl, popup, strayPopup])]);
    expect(remove.has(popup)).toBe(true);
    expect(remove.has(strayPopup)).toBe(false);
  });

  it('removes a legacy PDkef badge on a removed highlight, but not other FreeText', () => {
    const ref = {};
    const hl = raw({ ref, quadPoints: QUAD });
    const badge = raw({ subtype: 'FreeText', irt: ref, rt: 'Group', contents: '12' });
    const slashBadge = raw({ subtype: 'FreeText', irt: ref, rt: '/Group', contents: '3' });
    const wordy = raw({ subtype: 'FreeText', irt: ref, rt: 'Group', contents: 'hello' });
    const elsewhere = raw({ subtype: 'FreeText', irt: {}, rt: 'Group', contents: '1' });
    const { remove } = run([page([hl, badge, slashBadge, wordy, elsewhere])]);
    expect(remove.has(badge)).toBe(true);
    expect(remove.has(slashBadge)).toBe(true);
    expect(remove.has(wordy)).toBe(false);
    expect(remove.has(elsewhere)).toBe(false);
  });

  it('keeps /NM ids unless already used, then generates; orders by page then annotation', () => {
    const a = raw({ quadPoints: QUAD, nm: 'same' });
    const b = raw({ quadPoints: QUAD, nm: 'same' });
    const c = raw({ subtype: 'Text', contents: 'n' });
    const { elements } = run([page([a, b], upright, 0), page([c], upright, 1)]);
    expect(elements.map((e) => e.id)).toEqual(['same', 'gen-1', 'gen-2']);
    expect(elements.map((e) => e.pageIndex)).toEqual([0, 0, 1]);
  });

  it('leaves commentedAt undefined for an unparseable /M', () => {
    const a = raw({ quadPoints: QUAD, contents: 'x', m: 'nonsense' });
    const c = run([page([a])]).elements[1] as CommentElement;
    expect(c.commentedAt).toBeUndefined();
  });
});

// ---- IO layer ----

function annot(doc: PDFDocument, fields: Record<string, unknown>): PDFRef {
  return doc.context.register(doc.context.obj(fields as never));
}

async function buildFixture() {
  const doc = await PDFDocument.create();
  const p = doc.addPage([200, 100]);
  const num = (...n: number[]) => n;
  const hlRef = doc.context.nextRef();
  const popupRef = annot(doc, { Type: 'Annot', Subtype: 'Popup', Rect: num(0, 0, 10, 10), Parent: hlRef });
  doc.context.assign(hlRef, doc.context.obj({
    Type: 'Annot', Subtype: 'Highlight', Rect: num(20, 40, 120, 50), QuadPoints: num(...QUAD),
    C: num(1, 1, 0), Contents: PDFHexString.fromText('Look שלום'), NM: PDFString.of('hl-io'),
    M: PDFString.of('D:20260102030405Z'), Popup: popupRef,
  }));
  const transparent = annot(doc, {
    Type: 'Annot', Subtype: 'Highlight', Rect: num(20, 20, 60, 30), QuadPoints: num(20, 30, 60, 30, 20, 20, 60, 20),
    C: [], Contents: PDFString.of('Passage note'),
  });
  const note = annot(doc, { Type: 'Annot', Subtype: 'Text', Rect: num(150, 60, 170, 80), Contents: PDFString.of('Pinned') });
  const link = annot(doc, { Type: 'Annot', Subtype: 'Link', Rect: num(0, 0, 20, 20) });
  const reply = annot(doc, { Type: 'Annot', Subtype: 'Text', Rect: num(150, 60, 170, 80), Contents: PDFString.of('Reply'), IRT: note, RT: PDFName.of('R') });
  const badge = annot(doc, {
    Type: 'Annot', Subtype: 'FreeText', Rect: num(5, 5, 15, 15), Contents: PDFString.of('1'), IRT: hlRef, RT: PDFName.of('Group'),
  });
  p.node.set(PDFName.of('Annots'), doc.context.obj([hlRef, popupRef, transparent, note, link, reply, badge]));
  return { bytes: await doc.save(), refs: { link, reply } };
}

async function subtypesOf(bytes: ArrayBuffer | Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const annots = doc.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) return [];
  return annots.asArray().map((r) => (doc.context.lookup(r, PDFDict).get(PDFName.of('Subtype')) as PDFName).decodeText());
}

const toBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('importStandardAnnotations', () => {
  it('imports highlights and notes, removes them and their popups and badges, keeps everything else', async () => {
    const { bytes } = await buildFixture();
    const out = await importStandardAnnotations(toBuffer(bytes));
    expect(out.elements.map((e) => e.type)).toEqual(['highlight', 'comment', 'comment', 'comment']);
    const [h, hc, passage, pin] = out.elements as [HighlightElement, CommentElement, CommentElement, CommentElement];
    expect(h).toMatchObject({ id: 'hl-io', color: '#FFFF00' });
    expect(hc).toMatchObject({ comment: 'Look שלום', anchor: { kind: 'element', elementId: 'hl-io' }, commentedAt: Date.UTC(2026, 0, 2, 3, 4, 5) });
    expect(passage).toMatchObject({ comment: 'Passage note', anchor: { kind: 'passage' } });
    expect(pin).toMatchObject({ comment: 'Pinned', anchor: { kind: 'point' } });
    expect(await subtypesOf(out.bytes)).toEqual(['Link', 'Text']);
  });

  it('strips the same file to the same bytes every time, so its saved work and recents entry are found again', async () => {
    const { bytes } = await buildFixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 0, 1));
      const first = new Uint8Array((await importStandardAnnotations(toBuffer(bytes))).bytes);
      vi.setSystemTime(new Date(2027, 5, 1));
      const second = new Uint8Array((await importStandardAnnotations(toBuffer(bytes))).bytes);
      expect(second).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the input untouched when there is nothing to import', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 100]);
    const input = toBuffer(await doc.save());
    const out = await importStandardAnnotations(input);
    expect(out.bytes).toBe(input);
    expect(out.elements).toEqual([]);
  });

  it('returns the input untouched when the file cannot be read', async () => {
    const input = new TextEncoder().encode('not a pdf').buffer as ArrayBuffer;
    const out = await importStandardAnnotations(input);
    expect(out.bytes).toBe(input);
    expect(out.elements).toEqual([]);
  });

  it('works on a rotated page with a crop box', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([200, 100]);
    p.setRotation(degrees(90));
    p.setCropBox(10, 20, 150, 60);
    const note = annot(doc, { Type: 'Annot', Subtype: 'Text', Rect: [60, 40, 80, 60], Contents: PDFString.of('x') });
    p.node.set(PDFName.of('Annots'), doc.context.obj([note]));
    const out = await importStandardAnnotations(toBuffer(await doc.save()));
    expect(out.elements).toHaveLength(1);
    const c = out.elements[0] as CommentElement;
    // Rect center (70, 50) on a 150x60 crop at (10, 20), rotated 90: x runs down the page, y across it.
    expect(c.left + c.width / 2).toBeCloseTo(50);
    expect(c.top + c.height / 2).toBeCloseTo(40);
  });
});

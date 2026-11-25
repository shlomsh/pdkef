// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';
import '../../../test/support/realPdfjs.ts';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { applyPageEdits } from './applyPageEdits.js';
import { redactPdf } from './redact.js';
import { deleteObjectsFromPdf, listDeletableObjects } from './deleteObjects.js';

// applyPageEdits is a thin orchestrator over two already-tested functions
// (redactPdf in redact.test.js, deleteObjectsFromPdf in deleteObjects.test.js).
// What's specific to it, and worth testing here, is call order, which elements
// go to which function, what output feeds the second call, and progress
// scaling. Both passes run for real on a real PDF; both modules are
// spy-through, so the test sees the calls.
vi.mock('./redact.js', { spy: true });
vi.mock('./deleteObjects.js', { spy: true });

let SOURCE;
let TWO_PAGES;
let twoPageDeletions;
let box;
let deletion;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 200]).drawText('Gone word', { x: 20, y: 120, size: 12, font });
  SOURCE = new Uint8Array(await doc.save());
  const [text] = await listDeletableObjects(SOURCE);
  deletion = { id: 'd1', pageIndex: 0, type: 'delete', start: text.start, end: text.end };
  // Two pages with a deletion each: the real deletion pass reports 0.5, then 1.
  const two = await PDFDocument.create();
  const twoFont = await two.embedFont(StandardFonts.Helvetica);
  two.addPage([400, 200]).drawText('First gone', { x: 20, y: 120, size: 12, font: twoFont });
  two.addPage([400, 200]).drawText('Second gone', { x: 20, y: 120, size: 12, font: twoFont });
  TWO_PAGES = new Uint8Array(await two.save());
  const texts = await listDeletableObjects(TWO_PAGES);
  twoPageDeletions = [0, 1].map((pageIndex) => {
    const text = texts.find((t) => t.pageIndex === pageIndex);
    return { id: `d${pageIndex}`, pageIndex, type: 'delete', start: text.start, end: text.end };
  });
  box = { id: 'b1', pageIndex: 0, type: 'blackout', left: 10, top: 10, width: 30, height: 20, color: '#000000' };
});

beforeEach(() => {
  vi.mocked(redactPdf).mockClear();
  vi.mocked(deleteObjectsFromPdf).mockClear();
});

/** What the real deletion pass returned on its first call. */
const afterDeletions = () => vi.mocked(deleteObjectsFromPdf).mock.results[0].value;

describe('applyPageEdits', () => {
  it('runs finish on the first pass only: the Delete step on the mixed path, never the flatten step', async () => {
    const finish = vi.fn();
    const details = { author: { action: 'delete' } };
    await applyPageEdits(SOURCE, [deletion, box], undefined, { finish, details });
    expect(vi.mocked(deleteObjectsFromPdf).mock.calls[0][3]).toEqual({ finish, details });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(vi.mocked(redactPdf).mock.calls[0][3]).toEqual({ details });
    expect(vi.mocked(redactPdf).mock.calls[0][3]).not.toHaveProperty('finish');
  });

  it('runs finish in the flatten step when there are no deletions', async () => {
    const finish = () => {};
    await applyPageEdits(SOURCE, [box], undefined, { finish });
    expect(vi.mocked(redactPdf).mock.calls[0][3]).toEqual({ finish });
  });

  it('runs only redactPdf when there are no deletions, forwarding onProgress as-is', async () => {
    // Single phase: no scaling needed, so an omitted callback should stay
    // omitted rather than being wrapped into a no-op function.
    const result = await applyPageEdits(SOURCE, [box]);
    expect(deleteObjectsFromPdf).not.toHaveBeenCalled();
    expect(redactPdf).toHaveBeenCalledWith(SOURCE, [box], undefined, {});
    expect(result).toBe(await vi.mocked(redactPdf).mock.results[0].value);
  });

  it('runs only deleteObjectsFromPdf when there are no boxes, wrapping its output in the shared shape', async () => {
    const result = await applyPageEdits(SOURCE, [deletion]);
    expect(redactPdf).not.toHaveBeenCalled();
    expect(deleteObjectsFromPdf).toHaveBeenCalledWith(SOURCE, [deletion], undefined, {});
    expect(result).toEqual({ blob: await afterDeletions() });
    // The real pass wrote a real PDF without the deleted word.
    const out = await PDFDocument.load(await result.blob.arrayBuffer());
    expect(out.getPageCount()).toBe(1);
    expect(await listDeletableObjects(new Uint8Array(await result.blob.arrayBuffer()))).toEqual([]);
  });

  it('feeds the deletion pass output into redactPdf, not the original source', async () => {
    const result = await applyPageEdits(SOURCE, [deletion, box]);
    expect(deleteObjectsFromPdf).toHaveBeenCalledWith(SOURCE, [deletion], expect.any(Function), {});
    const fed = vi.mocked(redactPdf).mock.calls[0];
    expect(fed[0]).toBe(await afterDeletions());
    expect(fed[0]).not.toBe(SOURCE);
    expect(fed.slice(1, 2)).toEqual([[box]]);
    expect(fed[2]).toEqual(expect.any(Function));
    expect(fed[3]).toEqual({});
    expect(result).toBe(await vi.mocked(redactPdf).mock.results[0].value);
  });

  it('runs deletions before redaction, not the other way round', async () => {
    await applyPageEdits(SOURCE, [deletion, box]);
    expect(vi.mocked(deleteObjectsFromPdf).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(redactPdf).mock.invocationCallOrder[0]);
  });

  it('splits mixed elements by type regardless of array order', async () => {
    await applyPageEdits(SOURCE, [box, deletion]);
    expect(deleteObjectsFromPdf).toHaveBeenCalledWith(SOURCE, [deletion], expect.any(Function), {});
    expect(vi.mocked(redactPdf).mock.calls[0][0]).toBe(await afterDeletions());
    expect(vi.mocked(redactPdf).mock.calls[0][1]).toEqual([box]);
  });

  it('scales the deletion phase to 0-0.4 and the redaction phase to 0.4-1 when both run', async () => {
    const calls = [];
    await applyPageEdits(SOURCE, [deletion, box], (p) => calls.push(p));
    // The real deletion pass reports 1 for its one page: 1 * 0.4, then the one redacted page: 0.4 + 0.6 * 1.
    expect(calls).toEqual([0.4, 1]);

    // Two pages: the real deletion pass reports 0.5 then 1, so the scaled range is reached.
    const twoPageCalls = [];
    await applyPageEdits(TWO_PAGES, [...twoPageDeletions, box], (p) => twoPageCalls.push(p));
    expect(twoPageCalls).toEqual([0.2, 0.4, 0.7, 1]);
  });

  it('forwards progress unscaled when only one phase runs', async () => {
    const calls = [];
    await applyPageEdits(SOURCE, [deletion], (p) => calls.push(p));
    expect(calls).toEqual([1]);
  });

  it('still delegates to redactPdf when there is nothing to apply', async () => {
    // No elements at all is a UI-level guard (Redact tool disables Download),
    // not something this function special-cases.
    await applyPageEdits(SOURCE, []);
    expect(deleteObjectsFromPdf).not.toHaveBeenCalled();
    expect(redactPdf).toHaveBeenCalledWith(SOURCE, [], undefined, {});
  });
});

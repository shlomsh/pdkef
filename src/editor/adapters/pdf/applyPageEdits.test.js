import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyPageEdits } from './applyPageEdits.js';

// applyPageEdits is a thin orchestrator over two already-tested functions
// (redactPdf in redact.test.js, deleteObjectsFromPdf in deleteObjects.test.js).
// What's specific to it, and worth testing here, is call order, which elements
// go to which function, what output feeds the second call, and progress
// scaling - not the rasterization/splicing logic itself, so both dependencies
// are mocked rather than exercised for real (which would otherwise drag in
// pdfjs's canvas/DOMMatrix requirements for no added coverage).
const { redactPdf } = vi.hoisted(() => ({ redactPdf: vi.fn() }));
const { deleteObjectsFromPdf } = vi.hoisted(() => ({ deleteObjectsFromPdf: vi.fn() }));

vi.mock('./redact.js', () => ({ redactPdf }));
vi.mock('./deleteObjects.js', () => ({ deleteObjectsFromPdf }));

const SOURCE = { name: 'source.pdf' };
const AFTER_DELETIONS = { name: 'after-deletions.pdf' };
const FINAL = { name: 'final.pdf' };

const box = { id: 'b1', pageIndex: 0, type: 'blackout' };
const deletion = { id: 'd1', pageIndex: 0, type: 'delete', start: 10, end: 20 };

beforeEach(() => {
  redactPdf.mockReset().mockResolvedValue(FINAL);
  deleteObjectsFromPdf.mockReset().mockResolvedValue(AFTER_DELETIONS);
});

describe('applyPageEdits', () => {
  it('runs only redactPdf when there are no deletions, forwarding onProgress as-is', async () => {
    // Single phase: no scaling needed, so an omitted callback should stay
    // omitted rather than being wrapped into a no-op function.
    const result = await applyPageEdits(SOURCE, [box]);
    expect(deleteObjectsFromPdf).not.toHaveBeenCalled();
    expect(redactPdf).toHaveBeenCalledWith(SOURCE, [box], undefined);
    expect(result).toBe(FINAL);
  });

  it('runs only deleteObjectsFromPdf when there are no boxes, and returns its output directly', async () => {
    const result = await applyPageEdits(SOURCE, [deletion]);
    expect(redactPdf).not.toHaveBeenCalled();
    expect(deleteObjectsFromPdf).toHaveBeenCalledWith(SOURCE, [deletion], undefined);
    expect(result).toBe(AFTER_DELETIONS);
  });

  it('feeds the deletion pass output into redactPdf, not the original source', async () => {
    const result = await applyPageEdits(SOURCE, [deletion, box]);
    expect(deleteObjectsFromPdf).toHaveBeenCalledWith(SOURCE, [deletion], expect.any(Function));
    expect(redactPdf).toHaveBeenCalledWith(AFTER_DELETIONS, [box], expect.any(Function));
    expect(result).toBe(FINAL);
  });

  it('runs deletions before redaction, not the other way round', async () => {
    const order = [];
    deleteObjectsFromPdf.mockImplementation(async () => {
      order.push('delete');
      return AFTER_DELETIONS;
    });
    redactPdf.mockImplementation(async () => {
      order.push('redact');
      return FINAL;
    });

    await applyPageEdits(SOURCE, [deletion, box]);
    expect(order).toEqual(['delete', 'redact']);
  });

  it('splits mixed elements by type regardless of array order', async () => {
    await applyPageEdits(SOURCE, [box, deletion]);
    expect(deleteObjectsFromPdf).toHaveBeenCalledWith(SOURCE, [deletion], expect.any(Function));
    expect(redactPdf).toHaveBeenCalledWith(AFTER_DELETIONS, [box], expect.any(Function));
  });

  it('scales the deletion phase to 0-0.4 and the redaction phase to 0.4-1 when both run', async () => {
    deleteObjectsFromPdf.mockImplementation(async (_file, _els, onProgress) => {
      onProgress(0.5);
      onProgress(1);
      return AFTER_DELETIONS;
    });
    redactPdf.mockImplementation(async (_file, _els, onProgress) => {
      onProgress(0.5);
      onProgress(1);
      return FINAL;
    });

    const calls = [];
    await applyPageEdits(SOURCE, [deletion, box], (p) => calls.push(p));
    expect(calls).toEqual([0.2, 0.4, 0.7, 1]);
  });

  it('forwards progress unscaled when only one phase runs', async () => {
    deleteObjectsFromPdf.mockImplementation(async (_file, _els, onProgress) => {
      onProgress(1);
      return AFTER_DELETIONS;
    });
    const calls = [];
    await applyPageEdits(SOURCE, [deletion], (p) => calls.push(p));
    expect(calls).toEqual([1]);
  });

  it('still delegates to redactPdf when there is nothing to apply', async () => {
    // No elements at all is a UI-level guard (Redact tool disables Download),
    // not something this function special-cases.
    await applyPageEdits(SOURCE, []);
    expect(deleteObjectsFromPdf).not.toHaveBeenCalled();
    expect(redactPdf).toHaveBeenCalledWith(SOURCE, [], undefined);
  });
});

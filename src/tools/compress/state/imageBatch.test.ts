import { describe, expect, it } from 'vitest';
import {
  type BatchEvent,
  type BatchState,
  batchParts,
  batchReducer,
  emptyBatch,
  nextRow,
  summarizeBatch,
} from './imageBatch.ts';

const file = (name: string, type = 'image/jpeg') => new File(['x'], name, { type });
const blob = (type = 'image/jpeg') => new Blob(['y'], { type });
const run = (state: BatchState, ...events: BatchEvent[]) => events.reduce(batchReducer, state);
const chosen = (...names: string[]) =>
  run(emptyBatch, { type: 'filesChosen', files: names.map((n) => file(n)), targetKB: 100 });
const done = (s: BatchState, id: number, b: Blob = blob(), metTarget = true) =>
  batchReducer(s, { type: 'rowDone', id, run: s.run, blob: b, metTarget });

describe('batchReducer', () => {
  it('filesChosen makes one waiting row per file and bumps the run', () => {
    const s = run(emptyBatch, { type: 'filesChosen', files: [file('a.jpg'), file('b.jpg')], targetKB: 50 });
    expect(s.run).toBe(emptyBatch.run + 1);
    expect(s.targetKB).toBe(50);
    expect(s.rows.map((r) => r.id)).toEqual([0, 1]);
    expect(s.rows[1]).toMatchObject({
      status: 'waiting',
      blob: null,
      metTarget: null,
      passthrough: false,
      filename: null,
    });
  });

  it('filesChosen replaces earlier rows', () => {
    const s = run(chosen('a.jpg', 'b.jpg'), { type: 'filesChosen', files: [file('c.jpg')], targetKB: 100 });
    expect(s.rows.map((r) => r.file.name)).toEqual(['c.jpg']);
  });

  it('targetChanged with the same target returns the same state', () => {
    const s = chosen('a.jpg');
    expect(batchReducer(s, { type: 'targetChanged', targetKB: 100 })).toBe(s);
  });

  it('targetChanged resets every row to waiting and bumps the run', () => {
    let s = chosen('a.jpg', 'b.jpg', 'c.jpg');
    s = batchReducer(s, { type: 'rowStarted', id: 0, run: s.run });
    s = done(s, 0);
    s = batchReducer(s, { type: 'rowFailed', id: 1, run: s.run });
    const t = batchReducer(s, { type: 'targetChanged', targetKB: 20 });
    expect(t.targetKB).toBe(20);
    expect(t.run).toBe(s.run + 1);
    for (const r of t.rows) {
      expect(r).toMatchObject({ status: 'waiting', blob: null, metTarget: null, passthrough: false, filename: null });
    }
  });

  it('cleared empties the rows, bumps the run and keeps the target', () => {
    const s = run(chosen('a.jpg'), { type: 'cleared' });
    expect(s.rows).toEqual([]);
    expect(s.run).toBe(chosen('a.jpg').run + 1);
    expect(s.targetKB).toBe(100);
  });

  it('rowStarted marks the row working', () => {
    const s = chosen('a.jpg');
    expect(batchReducer(s, { type: 'rowStarted', id: 0, run: s.run }).rows[0].status).toBe('working');
  });

  it('rowFailed marks the row failed', () => {
    const s = chosen('a.jpg');
    expect(batchReducer(s, { type: 'rowFailed', id: 0, run: s.run }).rows[0].status).toBe('failed');
  });

  it('ignores events from an older run or for an unknown id', () => {
    const s = chosen('a.jpg');
    expect(batchReducer(s, { type: 'rowStarted', id: 0, run: s.run - 1 })).toBe(s);
    expect(batchReducer(s, { type: 'rowFailed', id: 9, run: s.run })).toBe(s);
    expect(batchReducer(s, { type: 'rowDone', id: 9, run: s.run, blob: blob(), metTarget: true })).toBe(s);
  });

  it('drops a stale rowDone after targetChanged', () => {
    const s = chosen('a.jpg');
    const t = batchReducer(s, { type: 'targetChanged', targetKB: 10 });
    const u = batchReducer(t, { type: 'rowDone', id: 0, run: s.run, blob: blob(), metTarget: true });
    expect(u).toBe(t);
    expect(u.rows[0].status).toBe('waiting');
  });

  it('rowDone names a compressed result from the blob type', () => {
    const s = done(chosen('IMG_1.png'), 0);
    expect(s.rows[0]).toMatchObject({
      status: 'done',
      passthrough: false,
      metTarget: true,
      filename: 'IMG_1-compressed.jpg',
    });
  });

  it('rowDone keeps the original name for a passthrough', () => {
    const s = run(emptyBatch, { type: 'filesChosen', files: [file('photo.png', 'image/png')], targetKB: 100 });
    const t = done(s, 0, s.rows[0].file);
    expect(t.rows[0]).toMatchObject({ passthrough: true, filename: 'photo.png' });
  });

  it('makes duplicate result names unique, case-insensitively', () => {
    let s = chosen('a.jpg', 'a.jpg', 'A.jpg');
    s = done(done(done(s, 0), 1), 2);
    expect(s.rows.map((r) => r.filename)).toEqual(['a-compressed.jpg', 'a-compressed (2).jpg', 'A-compressed (3).jpg']);
  });
});

describe('nextRow', () => {
  it('is the first waiting row', () => {
    const s = chosen('a.jpg', 'b.jpg');
    expect(nextRow(s)?.id).toBe(0);
    expect(nextRow(done(s, 0))?.id).toBe(1);
  });

  it('is null while a row is working, and when none is waiting', () => {
    const s = chosen('a.jpg', 'b.jpg');
    expect(nextRow(batchReducer(s, { type: 'rowStarted', id: 0, run: s.run }))).toBeNull();
    expect(nextRow(done(done(s, 0), 1))).toBeNull();
    expect(nextRow(emptyBatch)).toBeNull();
  });
});

describe('summarizeBatch', () => {
  it('counts met, missed, failed and finished', () => {
    let s = chosen('a.jpg', 'b.jpg', 'c.jpg', 'd.jpg');
    s = done(s, 0, blob(), true);
    s = done(s, 1, blob(), false);
    s = batchReducer(s, { type: 'rowFailed', id: 2, run: s.run });
    expect(summarizeBatch(s)).toEqual({ total: 4, finished: 3, met: 1, missed: 1, failed: 1, allFinished: false });
    s = done(s, 3);
    expect(summarizeBatch(s).allFinished).toBe(true);
  });

  it('is not finished when empty', () => {
    expect(summarizeBatch(emptyBatch).allFinished).toBe(false);
  });
});

describe('batchParts', () => {
  it('lists done rows in row order with their filenames', () => {
    let s = chosen('a.jpg', 'b.jpg', 'c.jpg');
    const bb = blob();
    const cb = blob();
    s = done(s, 2, cb);
    s = batchReducer(s, { type: 'rowFailed', id: 0, run: s.run });
    s = done(s, 1, bb);
    expect(batchParts(s)).toEqual([
      { blob: bb, filename: 'b-compressed.jpg' },
      { blob: cb, filename: 'c-compressed.jpg' },
    ]);
  });
});

describe('a done row keeps its dimensions (COMP-04 preview)', () => {
  it('stores what the search reported, and a new target clears it', () => {
    const dims = { width: 800, height: 600, originalWidth: 1600, originalHeight: 1200 };
    let s = batchReducer(chosen('a.jpg'), { type: 'rowDone', id: 0, run: 1, blob: blob(), metTarget: true, dimensions: dims });
    expect(s.rows[0].dimensions).toEqual(dims);
    s = batchReducer(s, { type: 'targetChanged', targetKB: 50 });
    expect(s.rows[0].dimensions).toBeNull();
  });
});

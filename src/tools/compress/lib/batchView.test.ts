import { describe, expect, it } from 'vitest';
import { batchParts, batchReducer, emptyBatch, type BatchEvent, type BatchState } from '../state/imageBatch.ts';
import { englishCompressMessages } from '../messages';
import { batchCover, batchName, batchStrip } from './batchView.ts';

const photo = (name: string, size = 1000) => new File(['x'.repeat(size)], name, { type: 'image/jpeg' });
const blob = (size: number) => new Blob(['y'.repeat(size)], { type: 'image/jpeg' });
const build = (...events: BatchEvent[]): BatchState => events.reduce(batchReducer, emptyBatch);
const done = (id: number, size: number): BatchEvent => ({ type: 'rowDone', id, run: 1, blob: blob(size), metTarget: true });
const stripOf = (state: BatchState, ready: boolean) => batchStrip(state.rows, batchParts(state), ready);

describe('batchName', () => {
  it('names the set by how many photos it holds', () => {
    expect(batchName(englishCompressMessages.batchLabel, 2)).toBe('2 photos');
    expect(batchName(englishCompressMessages.batchLabel, 12)).toBe('12 photos');
  });
});

describe('batchStrip', () => {
  it('the strip sums the set, before and after', () => {
    const state = build({ type: 'filesChosen', files: [photo('a.jpg', 1000), photo('b.jpg', 3000)], targetKB: 100 }, done(0, 300), done(1, 700));
    expect(stripOf(state, true)).toEqual({ before: 4000, compressedSize: 1000, showResult: true, savingsPercent: 75 });
  });

  it('shows what was picked while the set works, with no result yet', () => {
    const state = build({ type: 'filesChosen', files: [photo('a.jpg', 1000), photo('b.jpg', 3000)], targetKB: 100 }, done(0, 300));
    expect(stripOf(state, false)).toEqual({ before: 4000, compressedSize: 300, showResult: false, savingsPercent: 93 });
  });

  it('the strip sums only the photos Download saves when one fails', () => {
    const state = build({ type: 'filesChosen', files: [photo('a.jpg', 1000), photo('b.png', 3000)], targetKB: 100 }, done(0, 250), { type: 'rowFailed', id: 1, run: 1 });
    expect(stripOf(state, true)).toEqual({ before: 1000, compressedSize: 250, showResult: true, savingsPercent: 75 });
  });

  it('says no saving when nothing finished', () => {
    const state = build({ type: 'filesChosen', files: [photo('a.png')], targetKB: 100 }, { type: 'rowFailed', id: 0, run: 1 });
    expect(stripOf(state, true).savingsPercent).toBe(0);
  });
});

describe('batchCover', () => {
  it('the strip shows the first photo that could be drawn', () => {
    const [bad, good, later] = [photo('bad.png'), photo('good.jpg'), photo('later.jpg')];
    const rows = build({ type: 'filesChosen', files: [bad, good, later], targetKB: 100 }).rows;
    expect(batchCover(rows, new Map([[good, 'data:good'], [later, 'data:later']]))).toBe(good);
    expect(batchCover(rows, new Map())).toBeUndefined();
  });
});

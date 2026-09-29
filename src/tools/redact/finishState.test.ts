import { describe, expect, it } from 'vitest';
import { finishCountText, finishPagesText, finishStatusText, type FinishFacts } from './finishState.ts';

const base: FinishFacts = {
  phase: 'ready', progress: 0, fileName: 'redacted_x.pdf', pageCount: 2, picturePages: 0, boxCount: 0, deletionCount: 0,
};
const f = (o: Partial<FinishFacts>): FinishFacts => ({ ...base, ...o });

describe('finishStatusText', () => {
  it('shows rounded progress while exporting', () => {
    expect(finishStatusText(f({ phase: 'exporting', progress: 0.4 }))).toBe('Saving redacted_x.pdf… 40%');
    expect(finishStatusText(f({ phase: 'exporting', progress: 0.456 }))).toBe('Saving redacted_x.pdf… 46%');
  });
  it('clamps progress', () => {
    expect(finishStatusText(f({ phase: 'exporting', progress: 2 }))).toBe('Saving redacted_x.pdf… 100%');
    expect(finishStatusText(f({ phase: 'exporting', progress: -1 }))).toBe('Saving redacted_x.pdf… 0%');
  });
  it('says what was saved, with page plurals', () => {
    expect(finishStatusText(f({ phase: 'saved' }))).toBe('Saved redacted_x.pdf · 2 pages');
    expect(finishStatusText(f({ phase: 'saved', pageCount: 1 }))).toBe('Saved redacted_x.pdf · 1 page');
  });
  it('says a change stopped the download', () => {
    expect(finishStatusText(f({ phase: 'cancelled' }))).toBe('You changed something, so that download stopped. Download again when ready.');
  });
  it('is null for empty and ready', () => {
    expect(finishStatusText(f({ phase: 'empty' }))).toBeNull();
    expect(finishStatusText(f({ phase: 'ready' }))).toBeNull();
  });
});

describe('finishCountText', () => {
  it('joins boxes and deletions', () => {
    expect(finishCountText(f({ boxCount: 3, deletionCount: 1 }))).toBe('3 boxes · 1 deletion');
  });
  it('handles one kind alone and singular', () => {
    expect(finishCountText(f({ boxCount: 1 }))).toBe('1 box');
    expect(finishCountText(f({ deletionCount: 2 }))).toBe('2 deletions');
  });
  it('is null when both are zero', () => {
    expect(finishCountText(f({}))).toBeNull();
  });
});

describe('finishPagesText', () => {
  it('is null unless saved', () => {
    for (const phase of ['empty', 'ready', 'exporting', 'cancelled'] as const) {
      expect(finishPagesText(f({ phase, picturePages: 1 }))).toBeNull();
    }
  });
  it('covers no picture pages', () => {
    expect(finishPagesText(f({ phase: 'saved' }))).toBe('Every page keeps its text.');
  });
  it('covers all pages as pictures', () => {
    expect(finishPagesText(f({ phase: 'saved', picturePages: 2 }))).toBe('Every page is saved as a picture, so nothing hides under a box.');
    expect(finishPagesText(f({ phase: 'saved', pageCount: 1, picturePages: 1 }))).toBe('Every page is saved as a picture, so nothing hides under a box.');
  });
  it('covers some pages, singular and plural', () => {
    expect(finishPagesText(f({ phase: 'saved', pageCount: 5, picturePages: 1 })))
      .toBe('1 of 5 pages is saved as a picture, so nothing hides under a box. The rest keep their text.');
    expect(finishPagesText(f({ phase: 'saved', pageCount: 5, picturePages: 2 })))
      .toBe('2 of 5 pages are saved as pictures, so nothing hides under a box. The rest keep their text.');
  });
});

import { describe, expect, it } from 'vitest';
import { clickOutcome } from './clickScope.ts';

const base = { pageKind: 'text' as const, pressInkId: null, overExistingId: null };
describe('clickOutcome', () => {
  it('single click marks nothing', () => expect(clickOutcome({ ...base, detail: 1 })).toEqual({ mark: 'none', replaceInkId: null }));
  it('double click marks a word', () => expect(clickOutcome({ ...base, detail: 2 }).mark).toBe('word'));
  it('triple click marks a sentence on text, a line on a scan', () => {
    expect(clickOutcome({ ...base, detail: 3 }).mark).toBe('sentence');
    expect(clickOutcome({ ...base, detail: 4 }).mark).toBe('sentence');
    expect(clickOutcome({ ...base, detail: 3, pageKind: 'scan' }).mark).toBe('line');
  });
  it('replaces the drift ink from detail 2', () => {
    expect(clickOutcome({ ...base, detail: 2, pressInkId: 'i' }).replaceInkId).toBe('i');
    expect(clickOutcome({ ...base, detail: 1, pressInkId: 'i' }).replaceInkId).toBeNull();
  });
  it('an existing highlight is left alone', () => {
    expect(clickOutcome({ ...base, detail: 2, overExistingId: 'h' })).toEqual({ mark: 'none', replaceInkId: null });
    expect(clickOutcome({ ...base, detail: 3, overExistingId: 'h', pressInkId: 'i' })).toEqual({ mark: 'none', replaceInkId: null });
  });
});

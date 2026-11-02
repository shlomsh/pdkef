import { describe, expect, it } from 'vitest';
import { writerCancel, writerSave } from './noteWriter.ts';

const old = { id: 'a', comment: 'was', isNew: false };
const fresh = { id: 'b', comment: '', isNew: true };

describe('writerSave', () => {
  it('saves an edited note with a stamped patch', () => {
    expect(writerSave(old, 'now', 5)).toEqual({ kind: 'save', patch: { comment: 'now', commentedAt: 5 } });
  });
  it('blocks a blank draft on an old note', () => {
    expect(writerSave(old, '  ', 5)).toEqual({ kind: 'blocked' });
  });
  it('discards a blank new note', () => {
    expect(writerSave(fresh, '', 5)).toEqual({ kind: 'discard' });
  });
  it('does nothing when the old note is unchanged', () => {
    expect(writerSave(old, 'was', 5)).toEqual({ kind: 'none' });
  });
});

describe('writerCancel', () => {
  it('discards a new note', () => { expect(writerCancel(fresh)).toBe('discard'); });
  it('leaves an old note', () => { expect(writerCancel(old)).toBe('none'); });
});

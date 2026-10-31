import { describe, expect, it } from 'vitest';
import { commentPatch } from './commentCommit.ts';

describe('commentPatch', () => {
  it('commits new text, removes a blanked comment, and skips an unchanged one', () => {
    expect(commentPatch('note', undefined)).toEqual({ comment: 'note' });
    expect(commentPatch('  ', 'old')).toEqual({ comment: undefined });
    expect(commentPatch('same', 'same')).toBeNull();
    expect(commentPatch('', '')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { commentPatch } from './commentCommit.ts';

const NOW = 1_790_000_000_000;

describe('commentPatch', () => {
  it('stamps new or changed text, removes a blanked comment with its date, and skips an unchanged one', () => {
    expect(commentPatch('note', undefined, NOW)).toEqual({ comment: 'note', commentedAt: NOW });
    expect(commentPatch('new', 'old', NOW)).toEqual({ comment: 'new', commentedAt: NOW });
    expect(commentPatch('  ', 'old', NOW)).toEqual({ comment: undefined, commentedAt: undefined });
    expect(commentPatch('same', 'same', NOW)).toBeNull();
    expect(commentPatch('', '', NOW)).toEqual({ comment: undefined, commentedAt: undefined });
    expect(commentPatch('  ', '', NOW)).toEqual({ comment: undefined, commentedAt: undefined });
  });
});

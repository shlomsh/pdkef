import { describe, expect, it } from 'vitest';
import { commentPatch } from './commentCommit.ts';

const NOW = 1_790_000_000_000;

describe('commentPatch', () => {
  it('stamps new or changed text and skips an unchanged or blank draft (a blank save is a discard or a delete)', () => {
    expect(commentPatch('note', '', NOW)).toEqual({ comment: 'note', commentedAt: NOW });
    expect(commentPatch('new', 'old', NOW)).toEqual({ comment: 'new', commentedAt: NOW });
    expect(commentPatch('same', 'same', NOW)).toBeNull();
    expect(commentPatch('  ', 'old', NOW)).toBeNull();
    expect(commentPatch('', '', NOW)).toBeNull();
  });
});

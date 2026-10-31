import { describe, expect, it } from 'vitest';
import { commentDateLabel } from './commentDate.ts';

const now = new Date(2026, 9, 31, 15, 0).getTime();

describe('commentDateLabel', () => {
  it('shows the time for today', () => {
    expect(commentDateLabel(new Date(2026, 9, 31, 9, 5).getTime(), now, 'en')).toMatch(/9:05/);
  });
  it('shows day and month for another day', () => {
    expect(commentDateLabel(new Date(2026, 9, 3, 9, 5).getTime(), now, 'en')).toMatch(/^(3 Oct|Oct 3)$/);
  });
  it('shows nothing when absent', () => {
    expect(commentDateLabel(undefined, now, 'en')).toBe('');
  });
});

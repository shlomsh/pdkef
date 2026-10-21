import { describe, expect, it } from 'vitest';
import {
  RATING_DAILY_CAP,
  ratingCapCommands,
  ratingCommands,
  ratingCountsFromResults,
  ratingReadCommands,
  ratingTotalKey,
} from './ratingStore.js';

describe('ratingStore', () => {
  it('caps at 300 a day under its own key', () => {
    expect(RATING_DAILY_CAP).toBe(300);
    expect(ratingTotalKey('2026-10-21')).toBe('rating:total:2026-10-21');
    expect(ratingCapCommands('2026-10-21')).toEqual([['INCR', 'rating:total:2026-10-21']]);
  });

  it('counts a vote with one HINCRBY and no expiry', () => {
    const cmds = ratingCommands({ name: 'tool_rating', properties: { tool: 'merge', stars: 4 } });
    expect(cmds).toEqual([['HINCRBY', 'rating:merge', '4', 1]]);
  });

  it('reads one HGETALL per tool', () => {
    expect(ratingReadCommands(['merge', 'sign'])).toEqual([['HGETALL', 'rating:merge'], ['HGETALL', 'rating:sign']]);
  });

  it('parses HGETALL replies and ignores junk', () => {
    const counts = ratingCountsFromResults(
      ['merge', 'sign', 'split', 'redact'],
      [
        { result: ['5', '12', '4', '3', '9', '1', 'x', '2', '2', 'many', '1'] },
        { result: [] },
        { result: 'nope' },
        {},
      ],
    );
    expect(counts.merge).toEqual({ 1: 0, 2: 0, 3: 0, 4: 3, 5: 12 });
    expect(counts.sign).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(counts.split).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(counts.redact).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});

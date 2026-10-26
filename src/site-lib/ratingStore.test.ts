import { describe, expect, it } from 'vitest';
import {
  RATING_DAILY_CAP,
  RATING_ENTRIES_KEEP,
  RATING_ENTRIES_KEY,
  ratingCapCommands,
  ratingCommands,
  ratingCountsFromResults,
  ratingEntryCommands,
  ratingGeo,
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

  describe('geo and entries (SEO-48)', () => {
    const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

    it('keeps a two-letter country and a short upper-case region', () => {
      expect(ratingGeo(headers({ 'x-vercel-ip-country': 'IL', 'x-vercel-ip-country-region': 'TA' }))).toEqual({ country: 'IL', region: 'TA' });
    });

    it('drops lowercase or garbage values, and missing headers, leaving the key absent', () => {
      const geo = ratingGeo(headers({ 'x-vercel-ip-country': 'il', 'x-vercel-ip-country-region': 'toolong' }));
      expect(geo).toEqual({});
      expect('country' in geo || 'region' in geo).toBe(false);
      expect(ratingGeo(headers({}))).toEqual({});
      expect(ratingGeo(headers({ 'x-vercel-ip-country': 'US' }))).toEqual({ country: 'US' });
    });

    it('pushes a rating entry then trims, never expires', () => {
      const event = { name: 'tool_rating', properties: { tool: 'merge', stars: 4 } } as const;
      const cmds = ratingEntryCommands(event, { country: 'IL', region: 'TA' }, '2026-10-26');
      expect(RATING_ENTRIES_KEY).toBe('rating:entries');
      expect(RATING_ENTRIES_KEEP).toBe(10000);
      expect(cmds).toEqual([
        ['RPUSH', 'rating:entries', '{"tool":"merge","stars":4,"day":"2026-10-26","country":"IL","region":"TA"}'],
        ['LTRIM', 'rating:entries', -10000, -1],
      ]);
    });

    it('adds the comment last for a comment event', () => {
      const event = { name: 'tool_rating_comment', properties: { tool: 'sign', stars: 2, comment: 'slow' } } as const;
      expect(ratingEntryCommands(event, {}, '2026-10-26')[0]).toEqual([
        'RPUSH',
        'rating:entries',
        '{"tool":"sign","stars":2,"day":"2026-10-26","comment":"slow"}',
      ]);
    });
  });
});

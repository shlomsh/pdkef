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
  notesFromResults,
  notesReadCommands,
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

    it('records the OK to show a comment beside it', () => {
      const event = { name: 'tool_rating_comment', properties: { tool: 'sign', stars: 5, comment: 'lovely', share: true } } as const;
      expect(ratingEntryCommands(event, {}, '2026-11-06')[0][2]).toBe('{"tool":"sign","stars":5,"day":"2026-11-06","comment":"lovely","share":true}');
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

  describe('notes', () => {
    const names = (_country: string, region: string) => `Region ${region}`;
    const note = { tool: 'merge', stars: 5, comment: 'Quick and private', place: 'Nakuru, Kenya' };

    it('reads the newest approved notes and the recent votes', () => {
      expect(notesReadCommands()).toEqual([['LRANGE', 'rating:notes', -12, -1], ['LRANGE', 'rating:entries', -200, -1]]);
    });

    it('returns valid notes newest first and drops anything else', () => {
      const stored = [{ ...note, comment: 'old' }, 'not json', JSON.stringify({ ...note, stars: 9 }), note].map((v) =>
        typeof v === 'string' ? v : JSON.stringify(v),
      );
      expect(notesFromResults({ result: stored }, undefined, names).map((n) => n.comment)).toEqual(['Quick and private', 'old']);
    });

    it('is empty for a missing or unexpected reply', () => {
      expect(notesFromResults(undefined, undefined, names)).toEqual([]);
      expect(notesFromResults({ result: 'x' }, { result: 'x' }, names)).toEqual([]);
      expect(notesFromResults({ result: [5, null] }, { result: [5, null] }, names)).toEqual([]);
    });

    const vote = (tool: string, country: string | undefined, extra = {}) =>
      JSON.stringify({ tool, stars: 5, day: '2026-11-06', ...(country ? { country, region: 'X' } : {}), ...extra });

    it('fills up with recent votes as tool, stars and country, nothing else', () => {
      const words = JSON.stringify({ tool: 'merge', stars: 5, comment: 'Lovely', place: 'Haifa, Israel' });
      const notes = notesFromResults({ result: [words] }, { result: [vote('sign', 'KE'), vote('redact', 'AU')] }, names);
      expect(notes).toEqual([
        { tool: 'merge', stars: 5, comment: 'Lovely', place: 'Haifa, Israel' },
        { tool: 'redact', stars: 5, country: 'AU', region: 'Region X' },
        { tool: 'sign', stars: 5, country: 'KE', region: 'Region X' },
      ]);
    });

    it('never turns a comment into a note, and skips a vote with no country', () => {
      const entries = [vote('sign', 'KE', { comment: 'private words' }), vote('merge', undefined)];
      expect(notesFromResults(undefined, { result: entries }, names)).toEqual([]);
    });

    it('keeps variety: one note per tool and country, newest first', () => {
      const entries = [vote('redact', 'KE', { stars: 4 }), vote('redact', 'AU'), vote('redact', 'KE'), vote('redact', 'KE', { region: 'Y' })];
      expect(notesFromResults(undefined, { result: entries }, names)).toEqual([
        { tool: 'redact', stars: 5, country: 'KE', region: 'Region Y' },
        { tool: 'redact', stars: 5, country: 'AU', region: 'Region X' },
      ]);
    });

    it('falls back to the country when a region has no name', () => {
      const notes = notesFromResults(undefined, { result: [vote('merge', 'TW')] }, () => undefined);
      expect(notes).toEqual([{ tool: 'merge', stars: 5, country: 'TW' }]);
    });

    const countries = (n: number) => Array.from({ length: n }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}`);

    it('carries at most four per tool, however many votes there are', () => {
      const entries = countries(26).map((c) => vote('merge', c));
      expect(notesFromResults(undefined, { result: entries }, names)).toHaveLength(4);
    });

    it('leaves a quiet tool its notes when another tool has every recent vote', () => {
      const entries = [vote('redact', 'KE'), ...countries(26).map((c) => vote('merge', c))];
      expect(notesFromResults(undefined, { result: entries }, names).filter((n) => n.tool === 'redact')).toHaveLength(1);
    });

    it('opens with one note from each tool, so a busy tool does not fill the first four', () => {
      const entries = [vote('sign', 'KE'), vote('redact', 'KE'), ...countries(5).map((c) => vote('merge', c))];
      expect(notesFromResults(undefined, { result: entries }, names).slice(0, 3).map((n) => n.tool)).toEqual(['merge', 'redact', 'sign']);
    });

    it('puts every note with words ahead of the votes', () => {
      const words = JSON.stringify({ tool: 'sign', stars: 5, comment: 'Lovely', place: 'Haifa, Israel' });
      const notes = notesFromResults({ result: [words] }, { result: [vote('merge', 'KE'), vote('redact', 'AU')] }, names);
      expect(notes[0]!.comment).toBe('Lovely');
    });
  });
});

import { describe, expect, it } from 'vitest';
import { RATING_TOOLS as WIRE_TOOLS } from '../src/lib/telemetry/ratingSchema.ts';
import { commentLine, parseEntries, RATING_TOOLS, summarizeCounts } from './ratings-read.mjs';

describe('RATING_TOOLS', () => {
  it('names every tool the wire schema accepts, so no tool is missing from the counts', () => {
    expect([...RATING_TOOLS].sort()).toEqual([...WIRE_TOOLS].sort());
  });
});

describe('commentLine', () => {
  it('says which comments a person agreed to show', () => {
    const entry = { day: '2026-11-06', tool: 'merge', stars: 5, country: 'IL', region: 'TA', comment: 'lovely' };
    expect(commentLine(entry)).toBe('2026-11-06  merge  5★  IL-TA  lovely');
    expect(commentLine({ ...entry, share: true })).toBe('2026-11-06  merge  5★  IL-TA  [may show]  lovely');
  });
});

describe('summarizeCounts', () => {
  it('keeps only tools with votes, with average to one decimal and per-star counts', () => {
    const rows = summarizeCounts(
      ['merge', 'split', 'sign'],
      [
        { result: ['5', '2', '4', '1'] },
        { result: [] },
        { result: ['1', '1', '2', '1', '5', '1'] },
      ],
    );
    expect(rows).toEqual([
      { tool: 'merge', votes: 3, average: 4.7, stars: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 } },
      { tool: 'sign', votes: 3, average: 2.7, stars: { 1: 1, 2: 1, 3: 0, 4: 0, 5: 1 } },
    ]);
  });
});

describe('summarizeCounts ignores fields that are not a star', () => {
  it('drops a junk field at any position', () => {
    const rows = summarizeCounts(['merge'], [{ result: ['5', '1', 'foo', '9', '4', '1'] }]);
    expect(rows).toEqual([{ tool: 'merge', votes: 2, average: 4.5, stars: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } }]);
  });
});

describe('parseEntries', () => {
  it('parses JSON lines and skips the ones that are not JSON', () => {
    const out = parseEntries(['{"tool":"merge","stars":5}', 'nope', '{"comment":"hi"}']);
    expect(out).toEqual([{ tool: 'merge', stars: 5 }, { comment: 'hi' }]);
  });
});

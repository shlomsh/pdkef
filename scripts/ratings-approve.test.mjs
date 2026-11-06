import { describe, expect, it } from 'vitest';
import { MAX_COMMENT_LENGTH as WIRE_MAX_COMMENT_LENGTH } from '../src/lib/telemetry/ratingSchema.ts';
import { NOTES_KEY as WIRE_NOTES_KEY, parseNote } from '../src/site-lib/pinnedNote.ts';
import { approvedRows, candidates, MAX_COMMENT_LENGTH, noteFrom, NOTES_KEY } from './ratings-approve.mjs';

describe('NOTES_KEY', () => {
  it('names the list the site reads, so an approval lands where it is served', () => {
    expect(NOTES_KEY).toBe(WIRE_NOTES_KEY);
  });

  it('keeps the comment limit the site reads', () => {
    expect(MAX_COMMENT_LENGTH).toBe(WIRE_MAX_COMMENT_LENGTH);
  });
});

const entry = (comment, extra = {}) => ({ day: '2026-11-06', tool: 'merge', stars: 5, country: 'KE', comment, share: true, ...extra });

describe('candidates', () => {
  it('keeps only comments a person agreed to show', () => {
    const list = candidates([entry('a'), entry('b', { share: false }), entry('c', { share: undefined }), { tool: 'merge', stars: 4 }], []);
    expect(list.map((c) => c.comment)).toEqual(['a']);
  });

  it('leaves out comments already approved', () => {
    const list = candidates([entry('a'), entry('b')], [{ comment: 'a' }]);
    expect(list.map((c) => c.comment)).toEqual(['b']);
  });

  it('lists oldest first, numbered from 1 in the returned list', () => {
    // the store appends with RPUSH, so it already lists oldest first
    const list = candidates([entry('old'), entry('mid'), entry('new')], []);
    expect(list.map((c) => [c.n, c.comment])).toEqual([[1, 'old'], [2, 'mid'], [3, 'new']]);
  });
});

describe('candidate numbers', () => {
  it('stay put when another comment is approved', () => {
    const list = candidates([entry('a'), entry('b'), entry('c')], [{ comment: 'b' }]);
    expect(list.map((c) => [c.n, c.comment])).toEqual([[1, 'a'], [3, 'c']]);
  });
});

describe('approvedRows', () => {
  it('keeps the raw position when an unparseable string is skipped', () => {
    const rows = approvedRows(['{"comment":"x","place":"p"}', 'not json', '{"comment":"y","place":"q"}']);
    expect(rows.map((r) => r.id)).toEqual(['a1', 'a3']);
    expect(rows[1].raw).toBe('{"comment":"y","place":"q"}');
    expect(rows[1].note.place).toBe('q');
  });
});

describe('noteFrom', () => {
  it('is exactly tool, stars, comment and place, with the place trimmed', () => {
    const note = noteFrom(entry('lovely', { n: 1, day: 'x', country: undefined }), '  Nakuru, Kenya ');
    expect(note).toEqual({ tool: 'merge', stars: 5, comment: 'lovely', place: 'Nakuru, Kenya' });
    expect(Object.keys(note)).toEqual(['tool', 'stars', 'comment', 'place']);
  });

  it('keeps the country, for the flag, and the site accepts it', () => {
    const note = noteFrom(entry('lovely'), 'Nakuru, Kenya');
    expect(note.country).toBe('KE');
    expect(parseNote(note)).toEqual(note);
  });

  it('throws on an empty place or one over 60 characters', () => {
    expect(() => noteFrom(entry('x'), '   ')).toThrow();
    expect(() => noteFrom(entry('x'), 'a'.repeat(61))).toThrow();
    expect(noteFrom(entry('x'), 'a'.repeat(60)).place).toHaveLength(60);
  });

  it('refuses what the site would silently drop, and what it accepts the site serves', () => {
    expect(() => noteFrom(entry('x', { tool: 'gone' }), 'Haifa')).toThrow();
    expect(() => noteFrom(entry('x', { stars: 0 }), 'Haifa')).toThrow();
    expect(() => noteFrom(entry('   '), 'Haifa')).toThrow();
    expect(() => noteFrom(entry('a'.repeat(501)), 'Haifa')).toThrow();
    expect(parseNote(noteFrom(entry('a'.repeat(500)), 'Haifa'))).not.toBeNull();
  });
});

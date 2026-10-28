import { describe, expect, it } from 'vitest';
import { MAX_REPORT_BYTES } from './errorReportSchema.js';
import { MAX_COMMENT_LENGTH, RATING_TOOLS, REPORT_BYTE_LIMIT, parseRatingCommentEvent, parseRatingEvent } from './ratingSchema.js';
import { ANALYTICS_TOOLS } from './usageEventSchema.js';

const ok = { name: 'tool_rating', properties: { tool: 'merge', stars: 4 } };

describe('parseRatingEvent', () => {
  it('accepts a valid rating', () => {
    expect(parseRatingEvent(ok)).toEqual(ok);
  });
  it('rejects extra keys, comments and unknown tools', () => {
    expect(parseRatingEvent({ ...ok, extra: 1 })).toBeNull();
    expect(parseRatingEvent({ ...ok, properties: { ...ok.properties, comment: 'hi' } })).toBeNull();
    expect(parseRatingEvent({ ...ok, properties: { tool: 'nope', stars: 4 } })).toBeNull();
    expect(parseRatingEvent({ ...ok, name: 'other' })).toBeNull();
  });
  it.each([0, 6, 3.5, '3'])('rejects stars %s', (stars) => {
    expect(parseRatingEvent({ ...ok, properties: { tool: 'merge', stars } })).toBeNull();
  });
  it('lists the same tools as ANALYTICS_TOOLS', () => {
    expect([...RATING_TOOLS]).toEqual([...ANALYTICS_TOOLS]);
  });
});

const note = { name: 'tool_rating_comment', properties: { tool: 'redact', stars: 5, comment: '  Worked great  ' } };

describe('parseRatingCommentEvent', () => {
  it('accepts a comment and trims it', () => {
    expect(parseRatingCommentEvent(note)).toEqual({ ...note, properties: { ...note.properties, comment: 'Worked great' } });
  });
  it('keeps a comment of exactly 500 characters, counted as characters not bytes', () => {
    const comment = 'ש'.repeat(MAX_COMMENT_LENGTH);
    expect(MAX_COMMENT_LENGTH).toBe(500);
    expect(parseRatingCommentEvent({ ...note, properties: { ...note.properties, comment } })?.properties.comment).toBe(comment);
  });
  it.each(['', '   ', 'x'.repeat(501), 7, null])('rejects comment %s', (comment) => {
    expect(parseRatingCommentEvent({ ...note, properties: { ...note.properties, comment } })).toBeNull();
  });
  it('mirrors the endpoint body limit', () => {
    expect(REPORT_BYTE_LIMIT).toBe(MAX_REPORT_BYTES);
  });
  it('refuses a comment whose event would not fit the 2,048-byte report limit', () => {
    const control = '\u0001'.repeat(MAX_COMMENT_LENGTH); // 6 bytes each once JSON-encoded
    expect(parseRatingCommentEvent({ ...note, properties: { ...note.properties, comment: control } })).toBeNull();
    const cjk = '字'.repeat(MAX_COMMENT_LENGTH); // 1,500 bytes: fits
    expect(parseRatingCommentEvent({ ...note, properties: { ...note.properties, comment: cjk } })).not.toBeNull();
  });
  it('rejects extra keys, bad stars and unknown tools', () => {
    expect(parseRatingCommentEvent({ ...note, extra: 1 })).toBeNull();
    expect(parseRatingCommentEvent({ ...note, properties: { ...note.properties, country: 'IL' } })).toBeNull();
    expect(parseRatingCommentEvent({ ...note, properties: { ...note.properties, stars: 6 } })).toBeNull();
    expect(parseRatingCommentEvent({ ...note, properties: { ...note.properties, tool: 'nope' } })).toBeNull();
  });
  it('is not a rating, and a rating is not a comment', () => {
    expect(parseRatingEvent(note)).toBeNull();
    expect(parseRatingCommentEvent(ok)).toBeNull();
  });
});

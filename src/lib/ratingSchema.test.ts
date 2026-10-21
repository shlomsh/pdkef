import { describe, expect, it } from 'vitest';
import { RATING_TOOLS, parseRatingEvent } from './ratingSchema.js';
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

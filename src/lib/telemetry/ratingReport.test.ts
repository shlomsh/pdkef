import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
import { sendBeacon } from './errorReport.ts';
import { hasRated, markAsked, markRated, MY_STARS_KEY, ownStars, ratedKey, RATING_ASK_GAP_MS, ASKED_AT_KEY, reportRating, reportRatingComment, shouldAsk } from './ratingReport.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}
const blocked = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
};

const NOW = 1_800_000_000_000;

afterEach(() => vi.mocked(sendBeacon).mockClear());

describe('shouldAsk / markRated', () => {
  it('asks on a fresh device, and never again once rated anywhere', () => {
    const s = memoryStorage();
    expect(shouldAsk(s, 'compress', NOW)).toBe(true);
    markRated(s, 'compress', 4);
    expect(shouldAsk(s, 'compress', NOW)).toBe(false);
    expect(shouldAsk(s, 'split', NOW)).toBe(false);
    expect(ratedKey('compress')).toBe('pdkef:rated:compress');
  });
  it('markRated writes the legacy marker and the stars', () => {
    const s = memoryStorage();
    markRated(s, 'merge', 3);
    expect(s.getItem(ratedKey('merge'))).toBe('1');
    expect(s.getItem(MY_STARS_KEY)).toBe('3');
    expect(MY_STARS_KEY).toBe('pdkef:my-stars');
  });
  it('treats blocked or missing storage as already rated', () => {
    expect(shouldAsk(blocked, 'compress', NOW)).toBe(false);
    expect(shouldAsk(null, 'compress', NOW)).toBe(false);
    expect(() => markRated(blocked, 'compress', 5)).not.toThrow();
    expect(() => markRated(null, 'compress', 5)).not.toThrow();
  });
});

describe('hasRated / ownStars', () => {
  it('sees the new key, a legacy marker of any tool, and nothing on an empty device', () => {
    expect(hasRated(memoryStorage({ [MY_STARS_KEY]: '5' }))).toBe(true);
    expect(hasRated(memoryStorage({ [ratedKey('split')]: '1' }))).toBe(true);
    expect(hasRated(memoryStorage())).toBe(false);
  });
  it('is false for blocked or missing storage', () => {
    expect(hasRated(blocked)).toBe(false);
    expect(hasRated(null)).toBe(false);
  });
  it('ownStars parses 1 to 5 and nothing else', () => {
    expect(ownStars(memoryStorage({ [MY_STARS_KEY]: '4' }))).toBe(4);
    expect(ownStars(memoryStorage({ [MY_STARS_KEY]: 'banana' }))).toBeNull();
    expect(ownStars(memoryStorage({ [MY_STARS_KEY]: '0' }))).toBeNull();
    expect(ownStars(memoryStorage({ [MY_STARS_KEY]: '6' }))).toBeNull();
    expect(ownStars(memoryStorage())).toBeNull();
    expect(ownStars(blocked)).toBeNull();
    expect(ownStars(null)).toBeNull();
  });
});

describe('ask cadence', () => {
  it('asks a fresh device', () => {
    expect(shouldAsk(memoryStorage(), 'merge', NOW)).toBe(true);
  });
  it('never asks a rated tool, even after the gap', () => {
    const s = memoryStorage({ [ratedKey('merge')]: '1', [ASKED_AT_KEY]: String(NOW - 99 * RATING_ASK_GAP_MS) });
    expect(shouldAsk(s, 'merge', NOW)).toBe(false);
  });
  it('waits 14 days device-wide after any ask', () => {
    const s = memoryStorage();
    markAsked(s, NOW);
    expect(s.getItem(ASKED_AT_KEY)).toBe(String(NOW));
    expect(RATING_ASK_GAP_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(shouldAsk(s, 'split', NOW + RATING_ASK_GAP_MS - 1)).toBe(false);
    expect(shouldAsk(s, 'split', NOW + RATING_ASK_GAP_MS)).toBe(true);
  });
  it('treats a garbage asked-at as absent', () => {
    expect(shouldAsk(memoryStorage({ [ASKED_AT_KEY]: 'banana' }), 'split', NOW)).toBe(true);
  });
  it('markAsked never throws on blocked storage', () => {
    expect(() => markAsked(blocked, NOW)).not.toThrow();
    expect(() => markAsked(null, NOW)).not.toThrow();
  });
});

describe('reportRating', () => {
  it('sends the validated event and returns true', () => {
    expect(reportRating('compress', 5)).toBe(true);
    expect(sendBeacon).toHaveBeenCalledWith({ name: 'tool_rating', properties: { tool: 'compress', stars: 5 } });
  });
  it('refuses an invalid rating without sending', () => {
    expect(reportRating('compress', 6 as never)).toBe(false);
    expect(reportRating('nope' as never, 3)).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
  it('never throws', () => {
    vi.mocked(sendBeacon).mockImplementationOnce(() => { throw new Error('x'); });
    expect(reportRating('compress', 4)).toBe(false);
  });
});

describe('reportRatingComment', () => {
  it('sends the OK to show the words only when it was given', () => {
    reportRatingComment('compress', 5, 'lovely', true);
    expect(vi.mocked(sendBeacon).mock.lastCall?.[0]).toMatchObject({ properties: { share: true } });
    reportRatingComment('compress', 5, 'lovely');
    expect(vi.mocked(sendBeacon).mock.lastCall?.[0]).not.toHaveProperty('properties.share');
  });

  it('sends the trimmed comment and returns true', () => {
    expect(reportRatingComment('compress', 4, '  nice and fast  ')).toBe(true);
    expect(sendBeacon).toHaveBeenCalledWith({ name: 'tool_rating_comment', properties: { tool: 'compress', stars: 4, comment: 'nice and fast' } });
  });
  it('refuses an empty or over-long comment without sending', () => {
    expect(reportRatingComment('compress', 4, '   ')).toBe(false);
    expect(reportRatingComment('compress', 4, 'x'.repeat(501))).toBe(false);
    expect(sendBeacon).not.toHaveBeenCalled();
  });
  it('never throws', () => {
    vi.mocked(sendBeacon).mockImplementationOnce(() => { throw new Error('x'); });
    expect(reportRatingComment('compress', 4, 'hi')).toBe(false);
  });
});

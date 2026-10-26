import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
import { sendBeacon } from './errorReport.ts';
import { markAsked, markRated, ratedKey, RATING_ASK_GAP_MS, ASKED_AT_KEY, reportRating, reportRatingComment, shouldAsk } from './ratingReport.ts';

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
  it('asks on a fresh device, once per tool', () => {
    const s = memoryStorage();
    expect(shouldAsk(s, 'compress', NOW)).toBe(true);
    markRated(s, 'compress');
    expect(shouldAsk(s, 'compress', NOW)).toBe(false);
    expect(shouldAsk(s, 'split', NOW)).toBe(true);
    expect(ratedKey('compress')).toBe('pdkef:rated:compress');
  });
  it('treats blocked or missing storage as already rated', () => {
    expect(shouldAsk(blocked, 'compress', NOW)).toBe(false);
    expect(shouldAsk(null, 'compress', NOW)).toBe(false);
    expect(() => markRated(blocked, 'compress')).not.toThrow();
    expect(() => markRated(null, 'compress')).not.toThrow();
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

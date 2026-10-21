import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./errorReport.ts', () => ({ sendBeacon: vi.fn(() => true) }));
import { sendBeacon } from './errorReport.ts';
import { markRated, ratedKey, reportRating, shouldAsk } from './ratingReport.ts';

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

afterEach(() => vi.mocked(sendBeacon).mockClear());

describe('shouldAsk / markRated', () => {
  it('asks on a fresh device, once per tool', () => {
    const s = memoryStorage();
    expect(shouldAsk(s, 'compress')).toBe(true);
    markRated(s, 'compress');
    expect(shouldAsk(s, 'compress')).toBe(false);
    expect(shouldAsk(s, 'split')).toBe(true);
    expect(ratedKey('compress')).toBe('pdkef:rated:compress');
  });
  it('treats blocked or missing storage as already rated', () => {
    expect(shouldAsk(blocked, 'compress')).toBe(false);
    expect(shouldAsk(null, 'compress')).toBe(false);
    expect(() => markRated(blocked, 'compress')).not.toThrow();
    expect(() => markRated(null, 'compress')).not.toThrow();
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

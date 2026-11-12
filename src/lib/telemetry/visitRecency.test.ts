import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastDayFromRecents, localDay, readAndStampVisits, sinceFor, usableDay, visitFor } from './visitRecency.ts';
import { RECENT_FILES_META_KEY } from '../drafts/recentFilesKey.js';

describe('lastDayFromRecents (DEBT-61)', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15).getTime();
  it('is the local day of the newest saved file', () => {
    const raw = JSON.stringify([{ id: 'a', savedAt: at(2026, 10, 2) }, { id: 'b', savedAt: at(2026, 10, 9) }, { id: 'c', savedAt: 'x' }]);
    expect(lastDayFromRecents(raw)).toBe('2026-10-09');
  });
  it.each([[null], [''], ['not json'], ['{}'], ['[]'], ['[{"savedAt":"soon"}]'], ['[null, 3]']])('%s gives no day', (raw) => {
    expect(lastDayFromRecents(raw)).toBeNull();
  });
});

function fakeStorage(throws = false) {
  const m = new Map<string, string>();
  const fail = () => {
    if (throws) throw new Error('blocked');
  };
  return {
    getItem: (k: string) => (fail(), m.get(k) ?? null),
    setItem: (k: string, v: string) => (fail(), void m.set(k, v)),
    removeItem: (k: string) => (fail(), void m.delete(k)),
  };
}

describe('visitFor', () => {
  const today = '2026-10-31';
  it.each([
    ['2026-10-31', 'today'],
    ['2026-10-30', 'week'],
    ['2026-10-24', 'week'],
    ['2026-10-23', 'month'],
    ['2026-10-01', 'month'],
    ['2026-09-30', 'older'],
  ])('%s is %s', (last, visit) => {
    expect(visitFor(last, today)).toBe(visit);
  });
  it.each([[null], [''], ['garbage'], ['2026-1-5'], ['2026-13-45'], ['2026-11-01']])('%s is new', (last) => {
    expect(visitFor(last, today)).toBe('new');
  });
});

describe('localDay', () => {
  it('uses local time, not UTC', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDay(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});

describe('readAndStampVisits (visit)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());
  it('is new the first time, then today, and stamps the day', () => {
    const now = new Date(2026, 9, 21, 12);
    expect(readAndStampVisits(now)?.visit).toBe('new');
    expect(localStorage.getItem('pdkef:last-tool-visit')).toBe('2026-10-21');
    expect(readAndStampVisits(now)?.visit).toBe('today');
    expect(readAndStampVisits(new Date(2026, 9, 25))?.visit).toBe('week');
  });
  it('DEBT-61: a browser with no visit day but recent files from before is returning, aged by its newest file', () => {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify([{ id: 'a', savedAt: new Date(2026, 9, 18, 9).getTime() }]));
    expect(readAndStampVisits(new Date(2026, 9, 22, 12))?.visit).toBe('week');
    expect(localStorage.getItem('pdkef:last-tool-visit')).toBe('2026-10-22');
  });
  it('DEBT-61: a recent file 8 to 30 days old reads as month', () => {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify([{ id: 'a', savedAt: new Date(2026, 9, 2, 9).getTime() }]));
    expect(readAndStampVisits(new Date(2026, 9, 22, 12))?.visit).toBe('month');
  });
  it('DEBT-61: the visit day wins over recent files', () => {
    localStorage.setItem('pdkef:last-tool-visit', '2026-10-21');
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify([{ id: 'a', savedAt: new Date(2026, 9, 2, 9).getTime() }]));
    expect(readAndStampVisits(new Date(2026, 9, 22, 12))?.visit).toBe('week');
  });
  it('is undefined when storage throws', () => {
    vi.stubGlobal('localStorage', fakeStorage(true));
    expect(readAndStampVisits()).toBeUndefined();
  });
});

describe('sinceFor (MEM-45)', () => {
  const today = '2026-11-12';
  it.each([
    [null, 'first'], ['2026-11-12', 'day'], ['2026-11-11', 'week'], ['2026-11-05', 'week'], ['2026-11-04', 'month'],
    ['2026-10-13', 'month'], ['2026-10-12', 'quarter'], ['2026-08-14', 'quarter'], ['2026-08-13', 'older'],
    ['2026-11-13', 'first'], ['garbage', 'first'], ['2026-13-45', 'first'],
  ])('%s is %s', (first, since) => {
    expect(sinceFor(first as string | null, today)).toBe(since);
  });
});

describe('readAndStampVisits (since)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());
  const now = new Date(2026, 10, 12, 12);
  it('a first-ever view writes the first day and reads first; the same day after reads day, untouched', () => {
    expect(readAndStampVisits(now)).toEqual({ visit: 'new', since: 'first' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-12');
    const set = vi.spyOn(localStorage, 'setItem');
    expect(readAndStampVisits(now)).toEqual({ visit: 'today', since: 'day' });
    expect(set).not.toHaveBeenCalledWith('pdkef:first-visit', expect.anything());
  });
  it('a browser with only a last visit 10 days ago is seeded from it and reads month', () => {
    localStorage.setItem('pdkef:last-tool-visit', '2026-11-02');
    expect(readAndStampVisits(now)).toEqual({ visit: 'month', since: 'month' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-02');
  });
  it('a seeded same-day result is day', () => {
    localStorage.setItem('pdkef:last-tool-visit', '2026-11-12');
    expect(readAndStampVisits(now)).toEqual({ visit: 'today', since: 'day' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-12');
  });
  it('an existing first day 40 days ago stays untouched and reads quarter, even with a visit yesterday', () => {
    localStorage.setItem('pdkef:first-visit', '2026-10-03');
    localStorage.setItem('pdkef:last-tool-visit', '2026-11-11');
    expect(readAndStampVisits(now)).toEqual({ visit: 'week', since: 'quarter' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-10-03');
  });
  it('is undefined without storage', () => {
    vi.stubGlobal('localStorage', fakeStorage(true));
    expect(readAndStampVisits(now)).toBeUndefined();
  });
  it('an unreadable first day is reseeded from the last visit', () => {
    localStorage.setItem('pdkef:first-visit', 'abc');
    localStorage.setItem('pdkef:last-tool-visit', '2026-11-02');
    expect(readAndStampVisits(now)).toEqual({ visit: 'month', since: 'month' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-02');
  });
  it('an impossible first day with nothing else reads first and is rewritten as today', () => {
    localStorage.setItem('pdkef:first-visit', '2026-13-45');
    expect(readAndStampVisits(now)).toEqual({ visit: 'new', since: 'first' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-12');
  });
  it('a first day in the future (clock moved back) is reseeded from the last visit', () => {
    localStorage.setItem('pdkef:first-visit', '2026-11-15');
    localStorage.setItem('pdkef:last-tool-visit', '2026-11-11');
    expect(readAndStampVisits(now)).toEqual({ visit: 'week', since: 'week' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-11');
  });
  it('no first day and a garbage last day reads new and first', () => {
    localStorage.setItem('pdkef:last-tool-visit', 'garbage');
    expect(readAndStampVisits(now)).toEqual({ visit: 'new', since: 'first' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-12');
  });
  it('no first or last day, recents from 5 days ago: seeded from that day', () => {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify([{ id: 'a', savedAt: new Date(2026, 10, 7, 9).getTime() }]));
    expect(readAndStampVisits(now)).toEqual({ visit: 'week', since: 'week' });
    expect(localStorage.getItem('pdkef:first-visit')).toBe('2026-11-07');
  });
  describe('when the first day cannot be written (storage full)', () => {
    beforeEach(() => {
      const base = fakeStorage();
      vi.stubGlobal('localStorage', {
        ...base,
        setItem: (k: string, v: string) => {
          if (k === 'pdkef:first-visit') throw new Error('quota');
          base.setItem(k, v);
        },
      });
    });
    it('a returning browser keeps visit and the last-visit stamp', () => {
      localStorage.setItem('pdkef:last-tool-visit', '2026-11-02');
      expect(readAndStampVisits(now)).toEqual({ visit: 'month', since: 'month' });
      expect(localStorage.getItem('pdkef:last-tool-visit')).toBe('2026-11-12');
    });
    it('a brand-new browser still reads new and first, and stamps the last visit', () => {
      expect(readAndStampVisits(now)).toEqual({ visit: 'new', since: 'first' });
      expect(localStorage.getItem('pdkef:last-tool-visit')).toBe('2026-11-12');
    });
  });
});

describe('usableDay (MEM-45)', () => {
  it.each([
    [null, false], ['abc', false], ['2026-13-45', false], ['2026-11-13', false],
    ['2026-11-12', true], ['2026-10-01', true],
  ])('%s is %s', (day, ok) => {
    expect(usableDay(day, '2026-11-12')).toBe(ok);
  });
});

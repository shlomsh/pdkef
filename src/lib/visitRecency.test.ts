import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastDayFromRecents, localDay, readAndStampVisit, visitFor } from './visitRecency.ts';
import { RECENT_FILES_META_KEY } from './drafts/recentFilesKey.js';

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

describe('readAndStampVisit', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());
  it('is new the first time, then today, and stamps the day', () => {
    const now = new Date(2026, 9, 21, 12);
    expect(readAndStampVisit(now)).toBe('new');
    expect(localStorage.getItem('pdkef:last-tool-visit')).toBe('2026-10-21');
    expect(readAndStampVisit(now)).toBe('today');
    expect(readAndStampVisit(new Date(2026, 9, 25))).toBe('week');
  });
  it('DEBT-61: a browser with no visit day but recent files from before is returning, aged by its newest file', () => {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify([{ id: 'a', savedAt: new Date(2026, 9, 18, 9).getTime() }]));
    expect(readAndStampVisit(new Date(2026, 9, 22, 12))).toBe('week');
    expect(localStorage.getItem('pdkef:last-tool-visit')).toBe('2026-10-22');
  });
  it('DEBT-61: a recent file 8 to 30 days old reads as month', () => {
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify([{ id: 'a', savedAt: new Date(2026, 9, 2, 9).getTime() }]));
    expect(readAndStampVisit(new Date(2026, 9, 22, 12))).toBe('month');
  });
  it('DEBT-61: the visit day wins over recent files', () => {
    localStorage.setItem('pdkef:last-tool-visit', '2026-10-21');
    localStorage.setItem(RECENT_FILES_META_KEY, JSON.stringify([{ id: 'a', savedAt: new Date(2026, 9, 2, 9).getTime() }]));
    expect(readAndStampVisit(new Date(2026, 9, 22, 12))).toBe('week');
  });
  it('is undefined when storage throws', () => {
    vi.stubGlobal('localStorage', fakeStorage(true));
    expect(readAndStampVisit()).toBeUndefined();
  });
});

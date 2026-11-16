import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextToolHistory, prepareToolHistory } from './toolHistory.ts';

const list = (...tools: string[]) => JSON.stringify({ v: 1, tools });
const TODAY = '2026-11-20';

describe('nextToolHistory (MEM-45)', () => {
  it.each([['2026-11-17'], [TODAY]])('starts the list for a browser first seen on %s, when the list already existed', (first) => {
    expect(nextToolHistory(null, 'sign', first)).toEqual({ write: list('sign'), props: { tools: '1', newtool: true, firsttool: 'sign' } });
  });
  it.each([[null], ['not json'], ['{"v":2}'], ['[]'], ['{"v":1,"partial":true}']])('treats %s as no list', (stored) => {
    expect(nextToolHistory(stored, 'sign', TODAY).props?.tools).toBe('1');
  });
  it.each([['2026-11-16'], ['2025-01-01'], [null], ['garbage']])('sends nothing and writes nothing for a browser first seen on %s with no list', (first) => {
    expect(nextToolHistory(null, 'sign', first)).toEqual({});
  });
  it('keeps counting a list started earlier, whatever the first day says', () => {
    expect(nextToolHistory(list('sign'), 'merge', null)).toEqual({ write: list('sign', 'merge'), props: { tools: '2', firsttool: 'sign', newtool: true } });
  });
  it('a repeat of a tool carries no newtool', () => {
    expect(nextToolHistory(list('sign', 'merge'), 'sign', TODAY)).toEqual({ write: list('sign', 'merge'), props: { tools: '2', firsttool: 'sign' } });
  });
  it('buckets the count', () => {
    const t = (n: number) => nextToolHistory(list(...['sign', 'merge', 'split', 'redact', 'compress'].slice(0, n)), 'sign', TODAY).props?.tools;
    expect([t(1), t(2), t(3), t(4), t(5)]).toEqual(['1', '2', '3', '4+', '4+']);
  });
  it('drops entries that are not tools', () => {
    expect(nextToolHistory(list('bogus', 'sign'), 'sign', TODAY).props).toEqual({ tools: '1', firsttool: 'sign' });
  });
});

describe('prepareToolHistory', () => {
  const store = (throws = false) => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => {
        if (throws) throw new Error('blocked');
        return m.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (throws) throw new Error('blocked');
        m.set(k, v);
      },
    };
  };
  afterEach(() => vi.unstubAllGlobals());

  it('reads the first-visit day and writes only when committed', () => {
    const ls = store();
    ls.setItem('pdkef:first-visit', TODAY);
    vi.stubGlobal('localStorage', ls);
    const p = prepareToolHistory('sign')!;
    expect(p.props).toEqual({ tools: '1', newtool: true, firsttool: 'sign' });
    expect(ls.getItem('pdkef:tools-opened')).toBeNull();
    p.commit();
    expect(ls.getItem('pdkef:tools-opened')).toBe(list('sign'));
  });
  it('returns nothing for a browser first seen before the list existed', () => {
    const ls = store();
    ls.setItem('pdkef:first-visit', '2026-11-01');
    vi.stubGlobal('localStorage', ls);
    expect(prepareToolHistory('sign')).toBeUndefined();
    expect(ls.getItem('pdkef:tools-opened')).toBeNull();
  });
  it('is undefined without storage and never throws', () => {
    vi.stubGlobal('localStorage', store(true));
    expect(prepareToolHistory('sign')).toBeUndefined();
  });
});

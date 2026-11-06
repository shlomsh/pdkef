import { describe, expect, it } from 'vitest';
import { claimScanOffer, isCrooked, SCAN_OFFER_KEY } from './scanOffer.ts';

function memory(initial?: string) {
  const map = new Map<string, string>();
  if (initial !== undefined) map.set(SCAN_OFFER_KEY, initial);
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
  };
}

describe('isCrooked', () => {
  it('is true for every verdict but straight, and false for null', () => {
    for (const v of ['sideways', 'spread', 'lean', 'bent'] as const) expect(isCrooked(v)).toBe(true);
    expect(isCrooked('straight')).toBe(false);
    expect(isCrooked(null)).toBe(false);
  });
});

describe('claimScanOffer', () => {
  it('is true the first time and false after', () => {
    const s = memory();
    expect(claimScanOffer('a', s)).toBe(true);
    expect(claimScanOffer('a', s)).toBe(false);
    expect(claimScanOffer('b', s)).toBe(true);
  });

  it('keeps the newest 200 ids, dropping the oldest', () => {
    const s = memory();
    for (let i = 0; i < 201; i++) claimScanOffer(`id${i}`, s);
    const ids = JSON.parse(s.map.get(SCAN_OFFER_KEY)!);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('id1');
    expect(ids[199]).toBe('id200');
    expect(claimScanOffer('id0', s)).toBe(true);
  });

  it('reads unreadable or non-array JSON as empty', () => {
    expect(claimScanOffer('a', memory('{nope'))).toBe(true);
    expect(claimScanOffer('a', memory('{"a":1}'))).toBe(true);
  });

  it('is true when storage throws on read or write', () => {
    const boom = () => { throw new Error('denied'); };
    expect(claimScanOffer('a', { getItem: boom, setItem: () => {} })).toBe(true);
    expect(claimScanOffer('a', { getItem: () => null, setItem: boom })).toBe(true);
  });
});

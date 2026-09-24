import { describe, expect, it } from 'vitest';
import { parsePageSelector, PageSelectorError } from './pageSelector.js';

// DEBT-23: one parser for Split and PDF to Image. These cases carry forward
// every case both tools' own tests had for parsePageSelector, plus coverage
// proving PDF to Image's old gaps (open ranges, bound checks) are closed now
// that it shares this implementation.
describe('parsePageSelector', () => {
  it('returns every page for a blank selector', () => {
    expect(parsePageSelector('', 5)).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageSelector('   ', 4)).toEqual([1, 2, 3, 4]);
  });

  it('parses single pages, closed ranges, and lists', () => {
    expect(parsePageSelector('1-3', 5)).toEqual([1, 2, 3]);
    expect(parsePageSelector('1-3, 5', 5)).toEqual([1, 2, 3, 5]);
    expect(parsePageSelector(' 3-1,  4 ', 5)).toEqual([1, 2, 3, 4]);
    expect(parsePageSelector('2,4', 5)).toEqual([2, 4]);
  });

  it('parses an open-ended end range like "8-"', () => {
    expect(parsePageSelector('8-', 10)).toEqual([8, 9, 10]);
  });

  it('parses an open-ended start range like "-4"', () => {
    expect(parsePageSelector('-3', 5)).toEqual([1, 2, 3]);
    expect(parsePageSelector('-4', 10)).toEqual([1, 2, 3, 4]);
  });

  it('combines open and closed ranges in one selector', () => {
    expect(parsePageSelector('-2, 5-6, 9-', 10)).toEqual([1, 2, 5, 6, 9, 10]);
  });

  it('throws a PageSelectorError on malformed input', () => {
    expect(() => parsePageSelector('abc', 5)).toThrow(PageSelectorError);
    expect(() => parsePageSelector('1-2-3', 5)).toThrow(PageSelectorError);
  });

  it('bound-checks a single page and names the bad page in the error', () => {
    expect(() => parsePageSelector('6', 5)).toThrow(PageSelectorError);
    expect(() => parsePageSelector('99', 4)).toThrow(/99/);
  });

  it('bound-checks a closed range', () => {
    expect(() => parsePageSelector('1-6', 5)).toThrow(PageSelectorError);
  });

  it('bound-checks an open-ended end range', () => {
    expect(() => parsePageSelector('11-', 10)).toThrow(/11/);
  });

  it('bound-checks an open-ended start range', () => {
    expect(() => parsePageSelector('-11', 10)).toThrow(/11/);
  });
});

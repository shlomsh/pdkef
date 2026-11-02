import { describe, expect, it } from 'vitest';
import { cordTuck, initialCordTuck } from './cordTuck.ts';

describe('cordTuck', () => {
  it('starts untucked, anchored where the page is', () => {
    expect(initialCordTuck(40)).toEqual({ tucked: false, anchor: 40 });
  });

  it('tucks once the page has moved more than 12 px from the anchor, either way', () => {
    const s = initialCordTuck(100);
    expect(cordTuck(s, { type: 'scroll', y: 112 })).toBe(s);
    expect(cordTuck(s, { type: 'scroll', y: 113 })).toEqual({ tucked: true, anchor: 100 });
    expect(cordTuck(s, { type: 'scroll', y: 87 })).toEqual({ tucked: true, anchor: 100 });
  });

  it('untucks when scrolling back within 12 px of the anchor', () => {
    const tucked = { tucked: true, anchor: 100 };
    expect(cordTuck(tucked, { type: 'scroll', y: 105 })).toEqual({ tucked: false, anchor: 100 });
  });

  it('returns the same object when a scroll changes nothing', () => {
    const tucked = { tucked: true, anchor: 100 };
    expect(cordTuck(tucked, { type: 'scroll', y: 300 })).toBe(tucked);
  });

  it('pop untucks and re-anchors at the current position', () => {
    expect(cordTuck({ tucked: true, anchor: 100 }, { type: 'pop', y: 400 })).toEqual({ tucked: false, anchor: 400 });
  });

  it('hidden untucks and re-anchors, so the cord returns untucked after the lamp', () => {
    expect(cordTuck({ tucked: true, anchor: 100 }, { type: 'hidden', y: 0 })).toEqual({ tucked: false, anchor: 0 });
  });

  it('returns the same object when pop or hidden change nothing', () => {
    const s = initialCordTuck(7);
    expect(cordTuck(s, { type: 'pop', y: 7 })).toBe(s);
    expect(cordTuck(s, { type: 'hidden', y: 7 })).toBe(s);
  });
});

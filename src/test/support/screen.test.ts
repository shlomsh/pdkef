// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCREEN, matchesMediaQuery, resetScreen, setScreen, type Screen } from './screen.ts';

const desktop = DEFAULT_SCREEN;
const phone: Screen = { ...DEFAULT_SCREEN, width: 390, height: 844, pointer: 'coarse', hover: 'none' };
const m = (query: string, screen: Screen = desktop) => matchesMediaQuery(query, screen);

describe('matchesMediaQuery', () => {
  it('answers every query string the product uses', () => {
    expect(m('(min-width: 1024px)')).toBe(true);
    expect(m('(min-width: 1024px)', phone)).toBe(false);
    expect(m('(max-width: 1023px)')).toBe(false);
    expect(m('(max-width: 1023px)', phone)).toBe(true);
    expect(m('(max-width: 767px)', { ...desktop, width: 767 })).toBe(true);
    expect(m('(max-width: 767px)', { ...desktop, width: 768 })).toBe(false);
    expect(m('(pointer: coarse)')).toBe(false);
    expect(m('(pointer: coarse)', phone)).toBe(true);
    expect(m('(display-mode: standalone)')).toBe(false);
    expect(m('(display-mode: standalone)', { ...desktop, displayMode: 'standalone' })).toBe(true);
    expect(m('(hover: hover) and (pointer: fine)')).toBe(true);
    expect(m('(hover: hover) and (pointer: fine)', phone)).toBe(false);
    expect(m('(prefers-reduced-motion: reduce)')).toBe(true);
    expect(m('(prefers-reduced-motion: reduce)', { ...desktop, reducedMotion: false })).toBe(false);
    expect(m('(prefers-reduced-motion: no-preference)', { ...desktop, reducedMotion: false })).toBe(true);
  });

  it('reads height, any-pointer, any-hover and the colour scheme', () => {
    expect(m('(min-height: 768px)')).toBe(true);
    expect(m('(max-height: 700px)')).toBe(false);
    expect(m('(any-pointer: fine)')).toBe(true);
    expect(m('(any-pointer: coarse)')).toBe(false);
    expect(m('(any-hover: none)', phone)).toBe(true);
    expect(m('(prefers-color-scheme: light)')).toBe(true);
    expect(m('(prefers-color-scheme: dark)')).toBe(false);
  });

  it('takes a unitless zero and matches an empty query, as CSS does', () => {
    expect(m('(min-width: 0)')).toBe(true);
    expect(m('(max-width: 0)')).toBe(false);
    expect(m('')).toBe(true);
  });

  it('handles media types, not, only and comma lists', () => {
    expect(m('all')).toBe(true);
    expect(m('screen')).toBe(true);
    expect(m('print')).toBe(false);
    expect(m('screen and (min-width: 1024px)')).toBe(true);
    expect(m('print and (min-width: 1024px)')).toBe(false);
    expect(m('not screen')).toBe(false);
    expect(m('not (min-width: 2000px)')).toBe(true);
    expect(m('not all and (pointer: coarse)')).toBe(true);
    expect(m('only screen and (min-width: 1024px)')).toBe(true);
    expect(m('(min-width: 2000px), (pointer: fine)')).toBe(true);
    expect(m('(min-width: 2000px), (pointer: coarse)')).toBe(false);
  });

  it('throws, naming the query, on a feature or unit it does not know', () => {
    expect(() => m('(orientation: landscape)')).toThrow('(orientation: landscape)');
    expect(() => m('(min-width: 40em)')).toThrow('(min-width: 40em)');
    expect(() => m('(pointer: stylus)')).toThrow('(pointer: stylus)');
    expect(() => m('(min-width: 1024px) or (pointer: fine)')).toThrow('or (pointer');
  });
});

describe('window.matchMedia and setScreen', () => {
  it('is installed, and reads the state live', () => {
    const list = window.matchMedia('(max-width: 1023px)');
    expect(list.media).toBe('(max-width: 1023px)');
    expect(list.matches).toBe(false);
    setScreen({ width: 390 });
    expect(list.matches).toBe(true);
    expect(window.innerWidth).toBe(390);
  });

  it('sets the window size and fires resize only when the size changed', () => {
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);
    setScreen({ pointer: 'coarse' });
    expect(onResize).not.toHaveBeenCalled();
    setScreen({ width: 500, height: 900 });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(window.innerHeight).toBe(900);
    window.removeEventListener('resize', onResize);
  });

  it('fires change on each listener style, only for lists whose answer changed', () => {
    const list = window.matchMedia('(max-width: 1023px)');
    const other = window.matchMedia('(pointer: coarse)');
    const modern = vi.fn();
    const legacy = vi.fn();
    const onchange = vi.fn();
    const otherSeen = vi.fn();
    list.addEventListener('change', modern);
    list.addListener(legacy);
    list.onchange = onchange;
    other.addEventListener('change', otherSeen);

    setScreen({ width: 390 });
    expect(modern).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledTimes(1);
    const event = modern.mock.calls[0][0];
    expect(event).toMatchObject({ type: 'change', matches: true, media: '(max-width: 1023px)' });
    expect(otherSeen).not.toHaveBeenCalled();

    setScreen({ width: 380 }); // still matches: no event
    expect(modern).toHaveBeenCalledTimes(1);

    list.removeEventListener('change', modern);
    list.removeListener(legacy);
    setScreen({ width: 1200 });
    expect(modern).toHaveBeenCalledTimes(1);
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(onchange).toHaveBeenCalledTimes(2);
  });

  it('resetScreen goes back to the desktop without firing events', () => {
    const list = window.matchMedia('(pointer: coarse)');
    const seen = vi.fn();
    list.addEventListener('change', seen);
    setScreen({ pointer: 'coarse' });
    expect(seen).toHaveBeenCalledTimes(1);
    resetScreen();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(list.matches).toBe(false);
    expect(window.innerWidth).toBe(1024);
  });

  it('refuses a query it cannot read when the list is made', () => {
    expect(() => window.matchMedia('(color-gamut: p3)')).toThrow('(color-gamut: p3)');
  });
});

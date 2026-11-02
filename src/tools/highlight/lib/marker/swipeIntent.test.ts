import { describe, expect, it } from 'vitest';
import { directionLatch, gestureDirection, isMultiTouch, swipeIntent } from './swipeIntent.ts';

describe('swipeIntent', () => {
  it('waits below 10 px of travel, whatever the direction', () => {
    expect(swipeIntent(0, 0)).toBe('wait');
    expect(swipeIntent(9, 0)).toBe('wait');
    expect(swipeIntent(0, 9.9)).toBe('wait');
  });

  it('decides at exactly 10 px', () => {
    expect(swipeIntent(10, 0)).toBe('mark');
    expect(swipeIntent(0, 10)).toBe('scroll');
  });

  it('marks when the sideways travel is exactly twice the vertical', () => {
    expect(swipeIntent(20, 10)).toBe('mark');
    expect(swipeIntent(19, 10)).toBe('scroll');
  });

  it('scrolls on a vertical start and on a 45 degree diagonal', () => {
    expect(swipeIntent(2, 30)).toBe('scroll');
    expect(swipeIntent(-2, -30)).toBe('scroll');
    expect(swipeIntent(20, 20)).toBe('scroll');
  });

  it('marks a leftward start the same as a rightward one', () => {
    expect(swipeIntent(-30, 4)).toBe('mark');
    expect(swipeIntent(-30, -4)).toBe('mark');
  });
});

describe('isMultiTouch', () => {
  it('is true only with a second finger down', () => {
    const touch = (n: number) => Object.assign(new Event('touchmove'), { touches: new Array(n).fill({}) });
    expect(isMultiTouch(touch(1))).toBe(false);
    expect(isMultiTouch(touch(2))).toBe(true);
    expect(isMultiTouch(new Event('mousemove'))).toBe(false);
  });
});

describe('gestureDirection', () => {
  it('reads leftward as rtl and rightward as ltr', () => {
    expect(gestureDirection(-30, 2)).toBe('rtl');
    expect(gestureDirection(30, -2)).toBe('ltr');
  });
  it('needs 8 px sideways', () => {
    expect(gestureDirection(7, 0)).toBeUndefined();
    expect(gestureDirection(-7.9, 0)).toBeUndefined();
    expect(gestureDirection(8, 0)).toBe('ltr');
    expect(gestureDirection(-8, 0)).toBe('rtl');
  });
  it('needs the move to be more sideways than vertical', () => {
    expect(gestureDirection(-20, 21)).toBeUndefined();
    expect(gestureDirection(20, 10)).toBe('ltr');
  });
  it('reads a mouse dragged straight to a point down the passage by its sideways part (a Hebrew scan, 2026-11-02)', () => {
    expect(gestureDirection(-90, 60)).toBe('rtl');
    expect(gestureDirection(90, -60)).toBe('ltr');
  });
});

describe('directionLatch', () => {
  it('the text answer wins over any swipe', () => {
    const read = directionLatch('ltr', 'rtl');
    expect(read(-40, 0)).toBe('ltr');
  });
  it('with no text answer, the fallback holds until a direction is seen, then that one stays', () => {
    const read = directionLatch(undefined, 'ltr');
    expect(read(2, 1)).toBe('ltr');
    expect(read(-20, 0)).toBe('rtl');
    expect(read(60, 0)).toBe('rtl');
    expect(read(0, 30)).toBe('rtl');
  });
  it('a rightward first sight sticks too', () => {
    const read = directionLatch(undefined, 'rtl');
    expect(read(0, 0)).toBe('rtl');
    expect(read(20, 3)).toBe('ltr');
    expect(read(-80, 0)).toBe('ltr');
  });
});

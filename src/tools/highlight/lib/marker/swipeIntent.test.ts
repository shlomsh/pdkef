import { describe, expect, it } from 'vitest';
import { swipeIntent } from './swipeIntent.ts';

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

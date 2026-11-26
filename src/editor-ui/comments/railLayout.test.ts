import { describe, expect, it } from 'vitest';
import { railLayout } from './railLayout.ts';

const card = (id: string, top: number) => ({ id, firstBand: { top } });

describe('railLayout', () => {
  it('stacks cards below each other when their passages are close, and grows the rail', () => {
    // Rail 1000px, cards 80px tall, passages at 10% and 11%.
    const { tops, height } = railLayout([card('a', 10), card('b', 11)], new Map([['a', 80], ['b', 80]]), 1000);
    expect(tops.get('a')).toBe(94);
    expect(tops.get('b')).toBe(182);
    expect(height).toBe(262);
  });

  it('with a railHeight, a new height places the cards in the same render, no observer round trip', () => {
    const heights = new Map([['a', 80]]);
    expect(railLayout([card('a', 50)], heights, 1000).tops.get('a')).toBe(494);
    expect(railLayout([card('a', 50)], heights, 2000).tops.get('a')).toBe(994);
  });

  it('counts a card with no measured height as 0 and an empty rail as 0 high', () => {
    expect(railLayout([card('a', 10), card('b', 10.5)], new Map(), 1000).tops.get('b')).toBe(102);
    expect(railLayout([], new Map(), 1000).height).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { SIZE_LIMITS } from './scanBudget.ts';
import { limitOptions, lookOptions, sizeOptions } from './scanOptions.ts';

describe('scanOptions', () => {
  it('offers the three looks in order', () => {
    expect(lookOptions().map((o) => o.value)).toEqual(['original', 'grayscale', 'document']);
  });

  it('offers fit, A4 and Letter, naming the paper in the hint', () => {
    const options = sizeOptions();
    expect(options.map((o) => o.value)).toEqual(['fit', 'a4', 'letter']);
    expect(options[1].hint).toContain('A4');
    expect(options[2].hint).toContain('Letter');
  });

  it('offers one option per size limit, the unlimited one with its own hint', () => {
    const options = limitOptions();
    expect(options.map((o) => o.value)).toEqual(SIZE_LIMITS.map((l) => l.id));
    const none = options.find((o) => o.value === 'none');
    expect(none?.hint).not.toBe(options.find((o) => o.value !== 'none')?.hint);
  });
});

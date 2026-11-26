import { describe, expect, it } from 'vitest';
import { describeRedactUpdate } from './describeRedactUpdate.ts';

describe('describeRedactUpdate', () => {
  it('labels a move, a resize and a colour change in the voice of "Added blackout box"', () => {
    expect(describeRedactUpdate('move', 'blackout')).toBe('Moved blackout box');
    expect(describeRedactUpdate('resize', 'blur')).toBe('Resized blur box');
    expect(describeRedactUpdate('style', 'blackout')).toBe('Changed blackout box color');
  });
  it('falls back to the style label for a text kind, which cannot occur here', () => {
    expect(describeRedactUpdate('text', 'blackout')).toBe('Changed blackout box color');
  });
});

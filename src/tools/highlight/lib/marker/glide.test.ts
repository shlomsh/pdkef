import { describe, expect, it } from 'vitest';
import { GLIDE_GAP, glideFor } from './glide.ts';

describe('glideFor', () => {
  it('moves a covered mark down to clear the cover plus the gap', () => {
    expect(glideFor(50, 100)).toBe(100 + GLIDE_GAP - 50);
  });
  it('leaves a mark that is already below the cover', () => {
    expect(glideFor(200, 100)).toBe(0);
  });
  it('rounds up to whole pixels', () => {
    expect(glideFor(50.2, 100)).toBe(58);
  });
});

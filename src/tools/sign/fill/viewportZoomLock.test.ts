import { describe, expect, it } from 'vitest';
import { viewportContent } from './viewportZoomLock';

describe('viewportContent', () => {
  const original = 'width=device-width, initial-scale=1';

  it('appends maximum-scale=1 at resting scale (1)', () => {
    expect(viewportContent(original, 1)).toBe(`${original}, maximum-scale=1`);
  });

  it('appends maximum-scale=1 just past 1 (1.005)', () => {
    expect(viewportContent(original, 1.005)).toBe(`${original}, maximum-scale=1`);
  });

  it('holds a pinch zoom at its own scale, rounded down', () => {
    expect(viewportContent(original, 3.967)).toBe(`${original}, minimum-scale=3.96, maximum-scale=3.96`);
  });

  it('drops every limit while a pinch is in progress, at any scale', () => {
    expect(viewportContent(`${original}, minimum-scale=3.9, maximum-scale=3.9`, 3.9, true)).toBe(original);
    expect(viewportContent(`${original}, maximum-scale=1`, 1, true)).toBe(original);
  });

  it('replaces its own limits when re-applied, never duplicating them', () => {
    const zoomed = viewportContent(original, 2.5);
    expect(viewportContent(zoomed, 2.5)).toBe(zoomed);
    expect(viewportContent(zoomed, 1)).toBe(`${original}, maximum-scale=1`);
    const rested = viewportContent(original, 1);
    expect(viewportContent(rested, 1).match(/maximum-scale/g)).toHaveLength(1);
  });
});

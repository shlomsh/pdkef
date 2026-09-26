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

  it('drops maximum-scale=1 once pinched in (2)', () => {
    expect(viewportContent(original, 2)).toBe(original);
  });

  it('never duplicates maximum-scale when re-applied to its own output', () => {
    const once = viewportContent(original, 1);
    const again = viewportContent(once, 1);
    expect(again).toBe(once);
    expect(again.match(/maximum-scale=1/g)).toHaveLength(1);
  });
});

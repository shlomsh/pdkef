import { describe, expect, it } from 'vitest';
import { buildPlacedSignature } from './signaturePlacement.ts';

const input = { id: 'sig', dataUrl: 'data:x', aspectRatio: 0.5, pageIndex: 2, leftPercent: 50, topPercent: 40, widthPercent: 20 };

describe('buildPlacedSignature', () => {
  it('centres the signature on the point and keeps the image shape on the page', () => {
    // 20% of 600px is 120px wide, so 60px tall (aspect 0.5), which is 7.5% of an 800px page.
    const placed = buildPlacedSignature(input);
    expect(placed).toMatchObject({ id: 'sig', type: 'signature', pageIndex: 2, width: 20, aspectRatio: 0.5, dataUrl: 'data:x' });
    expect(placed.left).toBe(40);
    expect(placed.height).toBeCloseTo(7.5);
    expect(placed.top).toBeCloseTo(40 - 7.5 / 2);
  });

  it('uses the measured wrapper when there is one', () => {
    const placed = buildPlacedSignature({ ...input, wrapperSize: { width: 1000, height: 1000 } });
    expect(placed.height).toBeCloseTo(10);
  });
});

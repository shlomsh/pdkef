import { describe, expect, it } from 'vitest';
import { applySignatureResize } from './signature.ts';
import { applySymbolResize } from './symbol.ts';

describe('center-anchored registry resize behavior', () => {
  it('keeps a resized element centered and within page bounds', () => {
    expect(applySignatureResize({
      deltaWidth: 20,
      minWidth: 3,
      aspectRatio: 1,
      page: { width: 600, height: 800 },
      start: { left: 20, top: 30, width: 20, height: 15 },
    })).toEqual({ left: 10, top: 22.5, width: 40, height: 30 });
  });

  it('honors the caller-provided symbol pixel floor after conversion to percent', () => {
    const patch = applySymbolResize({
      deltaWidth: -50,
      minWidth: 4,
      aspectRatio: 1,
      page: { width: 600, height: 800 },
      start: { left: 20, top: 30, width: 10, height: 7.5 },
    });
    expect(patch.width).toBe(4);
    expect(patch.height).toBe(3);
  });
});

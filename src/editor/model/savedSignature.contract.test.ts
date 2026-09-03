import { describe, expect, it } from 'vitest';
import type { SavedSignature } from './savedSignature.ts';

describe('SavedSignature contract', () => {
  it('describes a reusable signature before it is placed on a page', () => {
    const signature: SavedSignature = {
      id: 'sig-1',
      dataUrl: 'data:image/png;base64,AA==',
      aspectRatio: 0.4,
    };

    expect(signature.id).toBe('sig-1');
  });

  it('rejects incomplete and malformed library entries at compile time', () => {
    // @ts-expect-error a saved signature must retain its stable library id
    const missingId: SavedSignature = {
      dataUrl: 'data:image/png;base64,AA==',
      aspectRatio: 0.4,
    };

    const invalidRatio: SavedSignature = {
      id: 'sig-2',
      dataUrl: 'data:image/png;base64,AA==',
      // @ts-expect-error aspect ratios are numeric, never serialized strings
      aspectRatio: '0.4',
    };

    expect(missingId).toBeDefined();
    expect(invalidRatio).toBeDefined();
  });
});

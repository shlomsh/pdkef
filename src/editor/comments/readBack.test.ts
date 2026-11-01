import { describe, expect, it, vi } from 'vitest';

const importStandardAnnotations = vi.fn();
vi.mock('./importAnnotations.ts', () => ({ importStandardAnnotations }));
const { readBackAnnotations } = await import('./readBack.ts');

describe('readBackAnnotations', () => {
  it('hands back what the reader found', async () => {
    const found = { bytes: new ArrayBuffer(2), elements: [{ id: 'h' }] };
    importStandardAnnotations.mockResolvedValueOnce(found);
    expect(await readBackAnnotations(new ArrayBuffer(1))).toBe(found);
  });

  it('opens the file untouched when reading fails', async () => {
    const bytes = new ArrayBuffer(1);
    importStandardAnnotations.mockRejectedValueOnce(new Error('chunk failed'));
    expect(await readBackAnnotations(bytes)).toEqual({ bytes, elements: [] });
  });
});

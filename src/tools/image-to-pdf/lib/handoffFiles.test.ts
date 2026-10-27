import { describe, expect, it } from 'vitest';
import { toHandoffFiles } from './handoffFiles';

describe('toHandoffFiles', () => {
  it('keeps page order and carries name, type and bytes', async () => {
    const a = new File([new Uint8Array([1, 2])], 'a.png', { type: 'image/png' });
    const b = new File([new Uint8Array([3])], 'b.jpg', { type: 'image/jpeg' });
    const out = await toHandoffFiles([a, b]);
    expect(out.map((f) => f.fileName)).toEqual(['a.png', 'b.jpg']);
    expect(out.map((f) => f.fileType)).toEqual(['image/png', 'image/jpeg']);
    expect(new Uint8Array(out[0].fileBytes)).toEqual(new Uint8Array([1, 2]));
  });
});

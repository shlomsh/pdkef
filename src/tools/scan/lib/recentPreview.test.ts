// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recentPreview } from './recentPreview.ts';

describe('recentPreview', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is null where the browser cannot decode a blob into a bitmap', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await recentPreview(new Blob(['x'], { type: 'image/jpeg' }))).toBeNull();
  });

  it('draws page 1 at most 168px on its long edge, as a JPEG data URL', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 480, height: 640, close })));
    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
    try {
      expect(await recentPreview(new Blob(['x'], { type: 'image/jpeg' }))).toBe('data:image/jpeg;base64,AAAA');
      expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 126, 168);
      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.75);
      expect(close).toHaveBeenCalled();
    } finally {
      getContext.mockRestore();
      toDataURL.mockRestore();
    }
  });
});

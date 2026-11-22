import { afterEach, describe, expect, it, vi } from 'vitest';
import { recentPreview } from './recentPreview.ts';

afterEach(() => vi.restoreAllMocks());

const jpeg = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#c33';
  ctx.fillRect(0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no blob'))), 'image/jpeg', 0.9));
};

describe('recentPreview', () => {
  it('draws page 1 at most 168px on its long edge, as a JPEG data URL', async () => {
    const thumb = await jpeg(480, 640);
    const close = vi.spyOn(ImageBitmap.prototype, 'close');
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
    const url = await recentPreview(thumb);
    expect(url?.startsWith('data:image/jpeg')).toBe(true);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.75);
    expect(close).toHaveBeenCalled();
    const img = new Image();
    img.src = url as string;
    await img.decode();
    expect([img.naturalWidth, img.naturalHeight]).toEqual([126, 168]);
  });
});

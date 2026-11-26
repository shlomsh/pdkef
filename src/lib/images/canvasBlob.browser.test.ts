import { describe, expect, it } from 'vitest';
import { canvasToBlob } from './canvasBlob.js';

const painted = (width: number, height: number, colour: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);
  return canvas;
};

const decoded = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = painted(bitmap.width, bitmap.height, '#ffffff');
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, pixel: [...ctx.getImageData(1, 1, 1, 1).data] };
};

describe('canvasToBlob', () => {
  it('encodes the canvas as the type it was asked for, with its size and pixels, and passes the quality through to a JPEG', async () => {
    const blob = await canvasToBlob(painted(7, 5, '#ff0000'), 'image/png');
    expect(blob.type, 'png type').toBe('image/png');
    expect(await decoded(blob), 'png size and pixels').toEqual({ width: 7, height: 5, pixel: [255, 0, 0, 255] });

    const canvas = painted(64, 64, '#3a7bd5');
    const low = await canvasToBlob(canvas, 'image/jpeg', 0.1);
    const high = await canvasToBlob(canvas, 'image/jpeg', 0.95);
    expect(low.type, 'low quality type').toBe('image/jpeg');
    expect(high.type, 'high quality type').toBe('image/jpeg');
    expect(low.size, 'quality passed through').toBeLessThan(high.size);
  });

  it('rejects when the canvas cannot be exported, as a zero-size canvas cannot', async () => {
    await expect(canvasToBlob(painted(0, 0, '#000000'), 'image/png')).rejects.toThrow('Canvas export failed');
  });
});

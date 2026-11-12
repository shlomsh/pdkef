import { canvasToBlob } from './canvasBlob.js';
import { clampScaleToCanvas } from './canvasLimits.js';

// An <img> decodes what it has of a file cut short; createImageBitmap rejects the same file
// (measured in Chromium, DEBT-75), so the image element is the decoder here.
function decodeImage(bytes: Uint8Array | ArrayBuffer): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
  const release = () => URL.revokeObjectURL(url);
  const image = new Image();
  image.src = url;
  return image.decode().then(() => ({ image, release }), (err) => { release(); throw err; });
}

// A PNG redrawn through the browser's own decoder, as fresh PNG bytes. For a file pdf-lib's
// decoder cannot read (a truncated or oddly encoded one) that the browser still shows:
// decode, draw on a canvas, encode again. Rejects when the browser cannot decode it either.
export async function redrawPng(bytes: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const { image, release } = await decodeImage(bytes);
  try {
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) throw new Error('The image has no pixels.');
    // Past the canvas limits a canvas comes back blank, so a huge picture is redrawn smaller.
    const scale = Math.min(1, clampScaleToCanvas(width, height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
  } finally {
    release();
  }
}

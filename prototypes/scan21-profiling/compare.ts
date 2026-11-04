// Worker output vs main-thread output, same photo: pixels and corners.
import * as P from 'SRC/tools/scan/lib/scanPipeline.ts';
import { inspectWith, processWith, type CanvasKit } from 'SRC/tools/scan/lib/pageWork/steps.ts';
import { withOrientation6 } from 'SRC/tools/scan/lib/pageWork/orientation.ts';
import type { Quad } from 'SRC/tools/scan/lib/quad.ts';

const kit: CanvasKit = {
  surface(width, height) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    return { canvas, ctx, toBlob: (t, q) => new Promise((r) => canvas.toBlob((b) => r(b!), t, q)), free: () => { canvas.width = 0; canvas.height = 0; } };
  },
  async decode(blob) {
    const url = URL.createObjectURL(blob); const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  },
};
async function pixels(blob: Blob) {
  const b = await createImageBitmap(blob);
  const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
  const x = c.getContext('2d')!; x.drawImage(b, 0, 0);
  return { w: b.width, h: b.height, d: x.getImageData(0, 0, b.width, b.height).data };
}
async function diff(a: Blob, b: Blob) {
  const pa = await pixels(a); const pb = await pixels(b);
  if (pa.w !== pb.w || pa.h !== pb.h) return { size: [pa.w, pa.h, pb.w, pb.h] };
  let max = 0; let sum = 0;
  for (let i = 0; i < pa.d.length; i++) { const v = Math.abs(pa.d[i] - pb.d[i]); max = Math.max(max, v); sum += v; }
  return { max, mean: sum / pa.d.length, sameBytes: a.size === b.size && (await a.arrayBuffer()).byteLength === (await b.arrayBuffer()).byteLength };
}
async function compare(photo: Blob, quad: Quad) {
  const wInspect = await P.inspectPhoto(photo);
  const mInspect = await inspectWith(kit, photo);
  const autoDetectSame = JSON.stringify(await P.guessPage(wInspect.preview)) === JSON.stringify(wInspect.quad);
  const wPage = await P.processPage(photo, quad, 'document');
  const mPage = (await processWith(kit, photo, quad, 'document')).page;
  return {
    autoDetectSame, inspect: { worker: [wInspect.width, wInspect.height, JSON.stringify(wInspect.quad)], main: [mInspect.width, mInspect.height, JSON.stringify(mInspect.quad)], preview: await diff(wInspect.preview, mInspect.preview) },
    page: { worker: [wPage.width, wPage.height, wPage.bentPx], main: [mPage.width, mPage.height, mPage.bentPx], pixels: await diff(wPage.blob, mPage.blob), thumb: await diff(wPage.thumb, mPage.thumb) },
  };
}
/** A sideways photo: the 2D canvas content stored rotated, with EXIF orientation 6. */
async function sideways(photo: Blob): Promise<Blob> {
  const b = await createImageBitmap(photo);
  const c = document.createElement('canvas'); c.width = b.height; c.height = b.width;
  const x = c.getContext('2d')!;
  // Store the upright image turned 90 degrees counter-clockwise; orientation 6 turns it back clockwise.
  x.translate(0, b.width); x.rotate(-Math.PI / 2); x.drawImage(b, 0, 0);
  const stored = await new Promise<Blob>((r) => c.toBlob((bb) => r(bb!), 'image/jpeg', 0.9));
  return new Blob([withOrientation6(new Uint8Array(await stored.arrayBuffer())) as BlobPart], { type: 'image/jpeg' });
}
(window as any).cmp = { compare, sideways };

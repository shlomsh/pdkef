// Inspects and processes Scan's pages off the main thread (SCAN-21), so the live camera and the page stay
// smooth while a 12 MP photo is decoded, measured, flattened and encoded. Started by offThread.ts.
import { withOrientation6 } from './orientation.ts';
import type { PageJob, PageReply, PageRequest } from './protocol.ts';
import { guessWith, inspectWith, processWith, type CanvasKit } from './steps.ts';

const kit: CanvasKit = {
  surface(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    return {
      canvas,
      ctx,
      toBlob: (type, quality) => canvas.convertToBlob({ type, quality }),
      free: () => {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  },
  async decode(blob) {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  },
};

/** Whether this worker can do the work exactly as the main thread would: draw and encode a JPEG off
 * screen, and decode a photo turned by its EXIF orientation, as <img> shows it. */
async function canWork(): Promise<boolean> {
  if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return false;
  try {
    const canvas = new OffscreenCanvas(2, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.convertToBlob !== 'function') return false;
    ctx.fillRect(0, 0, 2, 1);
    const jpeg = await canvas.convertToBlob({ type: 'image/jpeg' });
    if (jpeg.type !== 'image/jpeg') return false;
    const turned = new Blob([withOrientation6(new Uint8Array(await jpeg.arrayBuffer())) as BlobPart], { type: 'image/jpeg' });
    const decoded = await kit.decode(turned);
    const upright = decoded.width === 1 && decoded.height === 2;
    decoded.close();
    return upright;
  } catch {
    // expected: a browser that cannot do one of these in a worker (older Safari) processes pages on the main thread
    return false;
  }
}

/** An error the main thread can receive: Error and DOMException clone; anything else becomes one. */
const cloneable = (error: unknown) => (error instanceof Error || error instanceof DOMException ? error : new Error(String(error)));

async function run(job: PageJob): Promise<unknown> {
  if (job.kind === 'probe') return canWork();
  if (job.kind === 'inspect') return inspectWith(kit, job.photo);
  if (job.kind === 'guess') return guessWith(kit, job.image);
  const done = await processWith(kit, job.photo, job.quad, job.filter);
  return { ...done, measureError: done.measureError && cloneable(done.measureError) };
}

self.onmessage = async (e: MessageEvent<PageRequest>) => {
  const { id, job } = e.data;
  let reply: PageReply;
  try {
    reply = { id, ok: true, value: await run(job) };
  } catch (error) {
    // expected: the main thread runs the job itself, and reports this error only when it succeeds there
    reply = { id, ok: false, error: cloneable(error) };
  }
  self.postMessage(reply);
};

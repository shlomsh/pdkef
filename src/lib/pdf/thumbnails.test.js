// The shipped pdf.js renders real pdf-lib PDFs onto jsdom's real canvas, so the pixels are asserted as
// they are: the canvas is read back with getImageData, the page order and sizes come from the
// canvases each toDataURL call was made on, and a mid-render abort is a real RenderingCancelledException.
// Spies only watch (spy-through); pdf.js's own getDocument, getPage and render still run.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import '../../test/support/realPdfjs.ts';
import { getPdfjs } from './loadPdfjs.js';

vi.mock('pdfjs-dist', { spy: true });

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
// Three pages of different sizes, so each page shows in its canvas: widths 150 at TARGET_WIDTH,
// heights 194, 112 and 450. The pages are blank: jsdom has no Path2D, which pdf.js needs to paint a shape.
const SIZES = [[PAGE_WIDTH, PAGE_HEIGHT], [400, 300], [200, 600]];
const PNG = 'data:image/png;base64,';

async function pdfOf(sizes = SIZES) {
  const doc = await PDFDocument.create();
  for (const [width, height] of sizes) doc.addPage([width, height]);
  return new File([await doc.save()], 'test.pdf', { type: 'application/pdf' });
}

let pdfFile;
let documentProto;
let pageProto;
let realRender;
let getPage;
let renderCall;
let toDataUrl;

beforeAll(async () => {
  pdfFile = await pdfOf();
  // The classes pdf.js does not export, reached through one real document and page.
  const task = (await getPdfjs()).getDocument({ data: new Uint8Array(await pdfFile.arrayBuffer()) });
  const doc = await task.promise;
  documentProto = Object.getPrototypeOf(doc);
  pageProto = Object.getPrototypeOf(await doc.getPage(1));
  realRender = pageProto.render;
  await task.destroy();
});

beforeEach(() => {
  vi.mocked(pdfjs.getDocument).mockClear();
  getPage = vi.spyOn(documentProto, 'getPage');
  renderCall = vi.spyOn(pageProto, 'render');
  // Spy-through: the real toDataURL encodes; the spy keeps each call's canvas (`this`) to read back.
  toDataUrl = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL');
});

afterEach(() => {
  getPage.mockRestore();
  renderCall.mockRestore();
  toDataUrl.mockRestore();
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Every loading task getDocument handed out, and which of them pdf.js has since destroyed.
const openedTasks = () => vi.mocked(pdfjs.getDocument).mock.results.map((result) => result.value);
const destroyedTasks = () => openedTasks().filter((task) => task.destroyed);
const canvasesEncoded = () => toDataUrl.mock.contexts;
const pixelAt = (canvas, x, y) => Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);

describe('thumbnails.js', () => {
  describe('renderPdfThumbnails', () => {
    it('calls the callback once per page with 1-based page numbers and returns numPages', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const calls = [];

      const numPages = await renderPdfThumbnails(pdfFile, (pageNumber, dataUrl) => {
        calls.push([pageNumber, dataUrl]);
      });

      expect(numPages).toBe(3);
      expect(calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 3]);
      // Each data URL is what the real encoder made of that page's canvas, and the canvases follow the pages' sizes.
      expect(calls.map(([, dataUrl]) => dataUrl)).toEqual(toDataUrl.mock.results.map((result) => result.value));
      for (const [, dataUrl] of calls) expect(dataUrl.startsWith(PNG)).toBe(true);
      expect(canvasesEncoded().map((canvas) => [canvas.width, canvas.height])).toEqual([[150, 194], [150, 112], [150, 450]]);
      expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 3]);
    });

    it('prefills white before rendering each page', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      // Spy-through on the real 2D context: pdf.js paints its own white page background, so the order of
      // the calls is what shows the prefill came first, over the whole canvas, in white.
      const contextProto = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
      const fillStyle = vi.spyOn(contextProto, 'fillStyle', 'set');
      const fillRect = vi.spyOn(contextProto, 'fillRect');
      try {
        await renderPdfThumbnails(pdfFile, () => {});

        const canvases = canvasesEncoded();
        expect(canvases).toHaveLength(3);
        for (const canvas of canvases) {
          const context = canvas.getContext('2d');
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          // Every pixel opaque white: a transparent canvas would read [0, 0, 0, 0].
          expect(data.every((channel) => channel === 255)).toBe(true);

          const render = renderCall.mock.calls.findIndex(([params]) => params.canvasContext === context);
          const renderedAt = renderCall.mock.invocationCallOrder[render];
          const filled = fillRect.mock.calls.findIndex((args, call) => fillRect.mock.contexts[call] === context
            && args[0] === 0 && args[1] === 0 && args[2] === canvas.width && args[3] === canvas.height);
          expect(filled).toBeGreaterThanOrEqual(0);
          const filledAt = fillRect.mock.invocationCallOrder[filled];
          expect(filledAt).toBeLessThan(renderedAt);
          const whiteSet = fillStyle.mock.calls.findIndex(([value], call) => fillStyle.mock.contexts[call] === context && value === '#ffffff');
          expect(whiteSet).toBeGreaterThanOrEqual(0);
          expect(fillStyle.mock.invocationCallOrder[whiteSet]).toBeLessThan(filledAt);
        }
      } finally {
        fillStyle.mockRestore();
        fillRect.mockRestore();
      }
    });

    it('rejects with an AbortError before any page renders when the signal is already aborted', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const controller = new AbortController();
      controller.abort();

      const onPageRender = vi.fn();
      await expect(
        renderPdfThumbnails(pdfFile, onPageRender, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(onPageRender).not.toHaveBeenCalled();
      expect(renderCall).not.toHaveBeenCalled();
      // The source was still opened (and its document therefore still needs
      // tearing down) even though no page ever rendered.
      expect(openedTasks()).toHaveLength(1);
      expect(destroyedTasks()).toHaveLength(1);
    });

    it('stops before the next page when the signal aborts inside the callback, and destroys the loading task', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const controller = new AbortController();
      const rendered = [];
      const onPageRender = (pageNumber) => {
        rendered.push(pageNumber);
        if (pageNumber === 1) controller.abort();
      };

      await expect(
        renderPdfThumbnails(pdfFile, onPageRender, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(rendered).toHaveLength(1);
      expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1]);
      expect(openedTasks()).toHaveLength(1);
      expect(destroyedTasks()).toHaveLength(1);
    });

    it('renders exactly the given pageIndices, in that order', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const calls = [];

      await renderPdfThumbnails(pdfFile, (pageNumber, dataUrl) => calls.push([pageNumber, dataUrl]), {
        pageIndices: [2, 0],
      });

      // 0-based indices 2 and 0 are pages 3 and 1.
      expect(calls.map(([pageNumber]) => pageNumber)).toEqual([3, 1]);
      expect(calls.map(([, dataUrl]) => dataUrl)).toEqual(toDataUrl.mock.results.map((result) => result.value));
      expect(canvasesEncoded().map((canvas) => [canvas.width, canvas.height])).toEqual([[150, 450], [150, 194]]);
      expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([3, 1]);
    });
  });

  describe('openThumbnailSource', () => {
    it('shares one pdf.js worker across multiple documents instead of one per file (thumbnail throughput)', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');

      const first = await openThumbnailSource(pdfFile);
      const second = await openThumbnailSource(pdfFile);

      const calls = vi.mocked(pdfjs.getDocument).mock.calls;
      expect(calls).toHaveLength(2);
      const [[firstOpts], [secondOpts]] = calls;
      // thumbnails.js caches its shared worker at module scope, so it may come from an earlier test in
      // this file; what matters is that both documents were opened through the one real PDFWorker.
      expect(firstOpts.worker).toBeInstanceOf(pdfjs.PDFWorker);
      expect(secondOpts.worker).toBe(firstOpts.worker);

      // Destroying one document's source must not disturb the other: the
      // shared worker is never the thing a per-document destroy() tears
      // down (see the comment on getSharedWorker in thumbnails.js).
      await first.destroy();
      expect(firstOpts.worker.destroyed).toBe(false);
      expect((await second.render(0)).startsWith(PNG)).toBe(true);
      await second.destroy();
    });

    it('reports every page\'s aspect from its size, without rendering (DEBT-65)', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');
      const source = await openThumbnailSource(pdfFile);
      getPage.mockClear();

      expect(await source.aspects()).toEqual(SIZES.map(([width, height]) => width / height));
      expect(getPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([1, 2, 3]);
      expect(renderCall).not.toHaveBeenCalled();
      await source.destroy();
    });

    it('rejects a render() call made after destroy()', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');

      const source = await openThumbnailSource(pdfFile);
      expect(source.pageCount).toBe(3);
      await source.destroy();

      await expect(source.render(0)).rejects.toThrow(/after destroy/);
    });

    it('cancels the pdf.js RenderTask when the signal fires mid-render, and rejects with AbortError', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');

      const source = await openThumbnailSource(pdfFile);
      const controller = new AbortController();
      const renderPromise = source.render(0, { signal: controller.signal });
      const rejected = expect(renderPromise).rejects.toMatchObject({ name: 'AbortError' });

      // render() awaits the page it asked for; this continuation runs after render()'s own, which has by then
      // started pdf.js's real render and registered the abort listener, and before the worker finishes painting.
      await getPage.mock.results[0].value;
      controller.abort();

      await rejected;
      // The abort cancelled the real RenderTask: pdf.js rejects it with its own cancellation error.
      await expect(renderCall.mock.results[0].value.promise).rejects.toBeInstanceOf(pdfjs.RenderingCancelledException);
      await source.destroy();
    });

    it('rejects with AbortError when the signal fires just after the render settles', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');
      const source = await openThumbnailSource(pdfFile);
      const controller = new AbortController();
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: pdf.js gives a test no moment between a finished render and its caller; the real render runs, the abort is first on its promise.
      renderCall.mockImplementationOnce(function render(...args) {
        const task = realRender.apply(this, args);
        task.promise.then(() => controller.abort(), () => {});
        return task;
      });

      await expect(source.render(0, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
      // The render itself finished: nothing was left to cancel.
      await expect(renderCall.mock.results[0].value.promise).resolves.toBeUndefined();
      await source.destroy();
    });
  });

  describe('renderThumbnailWithMeta', () => {
    it('returns pageCount and the scaled, truncated canvas size for width: 150 on a 612x792 page', async () => {
      const { renderThumbnailWithMeta } = await import('./thumbnails.js');

      const result = await renderThumbnailWithMeta(pdfFile, { width: 150 });

      // scale = 150 / 612; height = 792 * scale = 194.11...px. Canvas
      // width/height setters coerce via the WebIDL "unsigned long" rule,
      // which truncates toward zero (Math.trunc), not round-to-nearest -
      // 194.11... truncates to 194 either way, but the mechanism matters:
      // a fractional value just above N.5 would still floor to N here,
      // where Math.round would carry it to N+1.
      expect(result.pageCount).toBe(3);
      expect(result.width).toBe(150);
      expect(result.height).toBe(194);
      expect(result.dataUrl).toBe(toDataUrl.mock.results[0].value);
      expect(result.dataUrl.startsWith(PNG)).toBe(true);
      expect(canvasesEncoded()[0]).toMatchObject({ width: 150, height: 194 });
      expect(openedTasks()).toHaveLength(1);
      expect(destroyedTasks()).toHaveLength(1);
    });
  });

  describe('renderThumbnail', () => {
    it('still returns a plain data-URL string', async () => {
      const { renderThumbnail } = await import('./thumbnails.js');

      const dataUrl = await renderThumbnail(pdfFile);

      expect(typeof dataUrl).toBe('string');
      expect(dataUrl).toBe(toDataUrl.mock.results[0].value);
      expect(dataUrl.startsWith(PNG)).toBe(true);
    });
  });
  describe('photos (JPEG/PNG)', () => {
    const closeSpy = vi.fn();
    let decodeSpy;

    // The decoded photo: a real jsdom canvas, 400 x 200, red with a blue right half, with the close() an ImageBitmap has.
    const decoded = () => {
      const bitmap = document.createElement('canvas');
      bitmap.width = 400;
      bitmap.height = 200;
      const context = bitmap.getContext('2d');
      context.fillStyle = '#c81e1e';
      context.fillRect(0, 0, 400, 200);
      context.fillStyle = '#1e1ec8';
      context.fillRect(200, 0, 200, 200);
      bitmap.close = closeSpy;
      return bitmap;
    };

    beforeEach(() => {
      closeSpy.mockClear();
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no createImageBitmap, so the decode cannot be real (its bitmap is a real canvas)
      decodeSpy = vi.fn(() => Promise.resolve(decoded()));
      globalThis.createImageBitmap = decodeSpy;
    });

    afterEach(() => {
      delete globalThis.createImageBitmap;
    });

    const photo = () => new File([new Uint8Array(4)], 'cat.jpg', { type: 'image/jpeg' });

    it('renderThumbnailWithMeta draws the stored pixels scaled to width, never touching pdf.js', async () => {
      const { renderThumbnailWithMeta } = await import('./thumbnails.js');
      const result = await renderThumbnailWithMeta(photo(), { width: 100, type: 'image/jpeg', quality: 0.7 });

      expect(decodeSpy).toHaveBeenCalledWith(expect.any(File), {
        imageOrientation: 'from-image',
        resizeWidth: 100,
        resizeQuality: 'high',
      });
      expect(result).toEqual({ dataUrl: toDataUrl.mock.results[0].value, pageCount: 1, width: 100, height: 50 });
      expect(result.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
      expect(toDataUrl.mock.calls).toEqual([['image/jpeg', 0.7]]);
      // The photo was really drawn, scaled over the whole 100 x 50 canvas.
      const [canvas] = canvasesEncoded();
      expect([canvas.width, canvas.height]).toEqual([100, 50]);
      expect(pixelAt(canvas, 0, 0)).toEqual([200, 30, 30, 255]);
      expect(pixelAt(canvas, 99, 49)).toEqual([30, 30, 200, 255]);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(pdfjs.getDocument).not.toHaveBeenCalled();
    });

    it('renderThumbnail returns the data URL string', async () => {
      const { renderThumbnail } = await import('./thumbnails.js');
      const dataUrl = await renderThumbnail(photo());
      expect(dataUrl).toBe(toDataUrl.mock.results[0].value);
      expect(dataUrl.startsWith(PNG)).toBe(true);
      expect(pdfjs.getDocument).not.toHaveBeenCalled();
    });

    it('openThumbnailSource gives a one-page source whose destroy closes the bitmap', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');
      const source = await openThumbnailSource(photo());

      expect(source.pageCount).toBe(1);
      const url = await source.render(0, { width: 80, type: 'image/png' });
      expect(url).toBe(toDataUrl.mock.results[0].value);
      expect(url.startsWith(PNG)).toBe(true);
      expect(canvasesEncoded()[0]).toMatchObject({ width: 80, height: 40 });
      await expect(source.render(1)).rejects.toThrow();
      // Decoded inside render, closed right after drawing: nothing is held between renders.
      expect(decodeSpy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      await source.render(0, { width: 80, type: 'image/png' });
      expect(decodeSpy).toHaveBeenCalledTimes(2);
      expect(closeSpy).toHaveBeenCalledTimes(2);
      await source.destroy();
      expect(closeSpy).toHaveBeenCalledTimes(2);
      await expect(source.render(0)).rejects.toThrow();
      expect(pdfjs.getDocument).not.toHaveBeenCalled();
    });

    it('openThumbnailSource decodes nothing until render, and decodes at the target width', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');
      const source = await openThumbnailSource(photo());
      expect(decodeSpy).not.toHaveBeenCalled();
      await source.render(0, { width: 80 });
      expect(decodeSpy).toHaveBeenCalledWith(expect.any(File), {
        imageOrientation: 'from-image',
        resizeWidth: 80,
        resizeQuality: 'high',
      });
    });

    it('falls back to a plain decode when the engine rejects the resize options', async () => {
      const { renderThumbnailWithMeta } = await import('./thumbnails.js');
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no createImageBitmap, so an engine that rejects the resize options cannot happen for real
      decodeSpy.mockImplementationOnce(() => Promise.reject(new TypeError('unsupported')));
      const result = await renderThumbnailWithMeta(photo(), { width: 100 });
      expect(decodeSpy).toHaveBeenLastCalledWith(expect.any(File), { imageOrientation: 'from-image' });
      expect(result.pageCount).toBe(1);
      expect(pixelAt(canvasesEncoded()[0], 25, 25)).toEqual([200, 30, 30, 255]);
    });

    it('renderPdfThumbnails reports the photo as page 1 of 1', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const calls = [];
      const count = await renderPdfThumbnails(photo(), (n, url) => calls.push([n, url]));
      expect(count).toBe(1);
      expect(calls).toEqual([[1, toDataUrl.mock.results[0].value]]);
      expect(calls[0][1].startsWith(PNG)).toBe(true);
    });

    it('honours an already-aborted signal without decoding at all', async () => {
      const { renderThumbnailWithMeta } = await import('./thumbnails.js');
      const controller = new AbortController();
      controller.abort();
      await expect(renderThumbnailWithMeta(photo(), { signal: controller.signal })).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(decodeSpy).not.toHaveBeenCalled();
    });
  });
});

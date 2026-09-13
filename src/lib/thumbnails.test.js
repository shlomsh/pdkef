// jsdom has no canvas backend, so these tests prove pdf.js was *driven*
// correctly (which pages were requested, in what order, with a white prefill
// before each render, and the abort/destroy contract) rather than what
// actually painted - that pixel-level proof is
// src/tools/merge/e2e/thumbnail-render.spec.js, a real-browser guard, per MERGE-01.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

// vi.hoisted so this is initialized before the vi.mock('pdfjs-dist', ...)
// factory below runs (mock factories are hoisted above imports).
const { mockState } = vi.hoisted(() => ({
  mockState: {
    numPages: 3,
    destroyCalls: 0,
    getPageCalls: [],
    // Per-page override for the render task pdf.js hands back; defaults to
    // an already-resolved render with a no-op `cancel` spy. Tests that need
    // to fire an abort signal *during* a render replace the entry for that
    // page number before calling into thumbnails.js.
    renderTasks: {},
    // How many `getDocument()` calls carried a `worker` option, and every
    // distinct worker instance seen - the throughput fix's whole point is
    // that opening several documents shares one `PDFWorker`, so a test can
    // tell "reused" from "one per document" by checking this set's size.
    getDocumentCalls: [],
    workerInstances: 0,
  },
}));

function defaultRenderTask() {
  return { promise: Promise.resolve(), cancel: vi.fn() };
}

// A minimal stand-in for pdf.js's real `PDFWorker`: immediately "ready"
// (`promise` resolves), spy-able `destroy`, and countable construction so
// `thumbnails.js`'s shared-worker cache can be told apart from "a fresh
// worker per document" in `getSharedWorker`'s own test below. Real pdf.js
// only lets `loadingTask.destroy()` terminate a worker IT created (see the
// comment on `getSharedWorker` in thumbnails.js) - this mock does not need
// to reproduce that split, since no test here calls a real `destroy()` on it.
class MockPDFWorker {
  constructor() {
    mockState.workerInstances += 1;
    this.promise = Promise.resolve();
    this.destroyed = false;
    this.destroy = vi.fn();
  }
}

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  PDFWorker: MockPDFWorker,
  getDocument: vi.fn((options) => {
    mockState.getDocumentCalls.push(options);
    return {
      promise: Promise.resolve({
        numPages: mockState.numPages,
        getPage: vi.fn((pageNumber) => {
          mockState.getPageCalls.push(pageNumber);
          return Promise.resolve({
            getViewport: ({ scale }) => ({ width: PAGE_WIDTH * scale, height: PAGE_HEIGHT * scale }),
            render: vi.fn(() => (mockState.renderTasks[pageNumber] ?? defaultRenderTask)()),
          });
        }),
      }),
      destroy: vi.fn(() => {
        mockState.destroyCalls += 1;
        return Promise.resolve();
      }),
    };
  }),
}));

// Recording 2D context: real assertions live in `contexts` (fillStyle at the
// moment of each fillRect, and the fillRect call itself), not in a real
// canvas backend jsdom doesn't have.
const contexts = [];

function makeRecordingContext() {
  const ctx = { fillStyle: null, direction: null };
  ctx.fillRect = vi.fn();
  contexts.push(ctx);
  return ctx;
}

let originalGetContext;
let originalToDataURL;

beforeEach(() => {
  mockState.numPages = 3;
  mockState.destroyCalls = 0;
  mockState.getPageCalls = [];
  mockState.renderTasks = {};
  mockState.getDocumentCalls = [];
  contexts.length = 0;

  originalGetContext = HTMLCanvasElement.prototype.getContext;
  originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return makeRecordingContext();
  };
  HTMLCanvasElement.prototype.toDataURL = function toDataURL() {
    return 'data:image/png;base64,x';
  };
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
  vi.clearAllMocks();
});

describe('thumbnails.js', () => {
  describe('renderPdfThumbnails', () => {
    it('calls the callback once per page with 1-based page numbers and returns numPages', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');
      const calls = [];

      const numPages = await renderPdfThumbnails(file, (pageNumber, dataUrl) => {
        calls.push([pageNumber, dataUrl]);
      });

      expect(numPages).toBe(3);
      expect(calls).toEqual([
        [1, 'data:image/png;base64,x'],
        [2, 'data:image/png;base64,x'],
        [3, 'data:image/png;base64,x'],
      ]);
      expect(mockState.getPageCalls).toEqual([1, 2, 3]);
    });

    it('prefills white before rendering each page', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');

      await renderPdfThumbnails(file, () => {});

      expect(contexts).toHaveLength(3);
      for (const ctx of contexts) {
        // fillStyle is read by fillRect in a real canvas; here we assert it
        // was set to white and that a fillRect ran, which together is what
        // "prefilled white" means for a stubbed context.
        expect(ctx.fillStyle).toBe('#ffffff');
        expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, expect.any(Number), expect.any(Number));
      }
    });

    it('rejects with an AbortError before any page renders when the signal is already aborted', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');
      const controller = new AbortController();
      controller.abort();

      const onPageRender = vi.fn();
      await expect(
        renderPdfThumbnails(file, onPageRender, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(onPageRender).not.toHaveBeenCalled();
      // The source was still opened (and its document therefore still needs
      // tearing down) even though no page ever rendered.
      expect(mockState.destroyCalls).toBe(1);
    });

    it('stops before the next page when the signal aborts inside the callback, and destroys the loading task', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');
      const controller = new AbortController();
      const onPageRender = vi.fn((pageNumber) => {
        if (pageNumber === 1) controller.abort();
      });

      await expect(
        renderPdfThumbnails(file, onPageRender, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });

      expect(onPageRender).toHaveBeenCalledTimes(1);
      expect(mockState.getPageCalls).toEqual([1]);
      expect(mockState.destroyCalls).toBe(1);
    });

    it('renders exactly the given pageIndices, in that order', async () => {
      const { renderPdfThumbnails } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');
      const calls = [];

      await renderPdfThumbnails(file, (pageNumber, dataUrl) => calls.push([pageNumber, dataUrl]), {
        pageIndices: [2, 0],
      });

      // 0-based indices 2 and 0 are pages 3 and 1.
      expect(calls).toEqual([
        [3, 'data:image/png;base64,x'],
        [1, 'data:image/png;base64,x'],
      ]);
      expect(mockState.getPageCalls).toEqual([3, 1]);
    });
  });

  describe('openThumbnailSource', () => {
    it('shares one pdf.js worker across multiple documents instead of one per file (thumbnail throughput)', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');
      // thumbnails.js caches its shared worker at module scope (like it
      // already does for `pdfjsLib` itself), so it may already exist from an
      // earlier test in this file; what matters here is that opening two
      // MORE documents constructs no additional one.
      const before = mockState.workerInstances;

      const first = await openThumbnailSource(new File([], 'a.pdf'));
      const second = await openThumbnailSource(new File([], 'b.pdf'));

      expect(mockState.workerInstances).toBe(Math.max(before, 1));
      expect(mockState.getDocumentCalls).toHaveLength(2);
      const [firstOpts, secondOpts] = mockState.getDocumentCalls;
      expect(firstOpts.worker).toBeInstanceOf(MockPDFWorker);
      expect(secondOpts.worker).toBe(firstOpts.worker);

      // Destroying one document's source must not disturb the other: the
      // shared worker is never the thing a per-document destroy() tears
      // down (see the comment on getSharedWorker in thumbnails.js).
      await first.destroy();
      expect(await second.render(0)).toBe('data:image/png;base64,x');
    });

    it('rejects a render() call made after destroy()', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');

      const source = await openThumbnailSource(file);
      expect(source.pageCount).toBe(3);
      await source.destroy();

      await expect(source.render(0)).rejects.toThrow(/after destroy/);
    });

    it('cancels the pdf.js RenderTask when the signal fires mid-render, and rejects with AbortError', async () => {
      const { openThumbnailSource } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');

      let resolveRender;
      const cancel = vi.fn();
      mockState.renderTasks[1] = () => ({
        promise: new Promise((resolve) => {
          resolveRender = resolve;
        }),
        cancel,
      });

      const source = await openThumbnailSource(file);
      const controller = new AbortController();
      const renderPromise = source.render(0, { signal: controller.signal });

      // `render()` still has one microtask (`await pdf.getPage(...)`) to run
      // before it reaches `page.render(...)` and registers the abort
      // listener; flush the microtask queue so `abort()` below arrives after
      // that listener is attached, not before.
      await Promise.resolve();
      await Promise.resolve();

      controller.abort();
      expect(cancel).toHaveBeenCalledTimes(1);

      // pdf.js's own RenderTask would reject its promise once cancelled;
      // simulate that so the render() call actually settles.
      resolveRender();

      await expect(renderPromise).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('renderThumbnailWithMeta', () => {
    it('returns pageCount and the scaled, truncated canvas size for width: 150 on a 612x792 page', async () => {
      const { renderThumbnailWithMeta } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');

      const result = await renderThumbnailWithMeta(file, { width: 150 });

      // scale = 150 / 612; height = 792 * scale = 194.11...px. Canvas
      // width/height setters coerce via the WebIDL "unsigned long" rule,
      // which truncates toward zero (Math.trunc), not round-to-nearest -
      // 194.11... truncates to 194 either way, but the mechanism matters:
      // a fractional value just above N.5 would still floor to N here,
      // where Math.round would carry it to N+1.
      expect(result.pageCount).toBe(3);
      expect(result.width).toBe(150);
      expect(result.height).toBe(194);
      expect(result.dataUrl).toBe('data:image/png;base64,x');
      expect(mockState.destroyCalls).toBe(1);
    });
  });

  describe('renderThumbnail', () => {
    it('still returns a plain data-URL string', async () => {
      const { renderThumbnail } = await import('./thumbnails.js');
      const file = new File([], 'test.pdf');

      const dataUrl = await renderThumbnail(file);

      expect(typeof dataUrl).toBe('string');
      expect(dataUrl).toBe('data:image/png;base64,x');
    });
  });
});

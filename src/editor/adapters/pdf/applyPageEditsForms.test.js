// @vitest-environment jsdom
//
// RED-29, end to end: Delete marks on text drawn inside a Form XObject
// (the iTextSharp shape) carry `formPath` from listDeletableObjects through
// the delete elements useDeleteTool.markObjects builds, into applyPageEdits.
// Runs the real deleteObjectsFromPdf and (for the cover path) redactPdf.
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { applyPageEdits } from './applyPageEdits.js';
import { listDeletableObjects } from './deleteObjects.js';
import { buildFormXObjectPdf } from './formXObjectFixture.test-helper.js';

vi.mock('pdfjs-dist', async () => {
  return await import('pdfjs-dist/legacy/build/pdf.mjs');
});

// The cover path rasterizes a page; jsdom has no canvas, so stub it as redact.test.js does.
const JPEG_1X1_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const realToDataURL = HTMLCanvasElement.prototype.toDataURL;
const realGetContext = HTMLCanvasElement.prototype.getContext;
afterAll(() => {
  HTMLCanvasElement.prototype.toDataURL = realToDataURL;
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

beforeAll(() => {
  HTMLCanvasElement.prototype.toDataURL = () => `data:image/jpeg;base64,${JPEG_1X1_BASE64}`;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    const base = { canvas: this, fillStyle: '', strokeStyle: '' };
    return new Proxy(base, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, invertSelf() { return this; } });
        return vi.fn();
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  };
  const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const workerUrl = pathToFileURL(workerPath).href;
  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
    get() { return workerUrl; },
    set() { /* keep it pointed at the real worker file */ },
    configurable: true,
  });
});

async function pageText(blob, pageIndex) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  const text = content.items.map((item) => item.str).join(' ');
  return text;
}

/** The delete element useDeleteTool.markObjects builds for one object. */
function deleteElementFor(object, n) {
  return {
    id: `d${n}`,
    pageIndex: object.pageIndex,
    type: 'delete',
    sourceObjectId: object.id,
    kind: object.kind,
    preview: object.preview,
    left: object.rect.left,
    top: object.rect.top,
    width: object.rect.width,
    height: object.rect.height,
    start: object.start,
    end: object.end,
    formPath: object.formPath ?? [],
  };
}

async function setup() {
  const bytes = await buildFormXObjectPdf({ pages: 3 });
  const file = new File([bytes], 'forms.pdf', { type: 'application/pdf' });
  const objects = await listDeletableObjects(file);
  const secret = objects.find((o) => o.pageIndex === 0 && o.kind === 'text' && /Secret 0/.test(o.preview ?? ''));
  return { file, secret, elements: secret ? [deleteElementFor(secret, 1)] : [] };
}

describe('applyPageEdits with Form XObject deletions', () => {
  it('reports the run inside the form with a non-empty formPath', async () => {
    const { secret } = await setup();
    expect(secret).toBeDefined();
    expect(secret.formPath.length).toBeGreaterThan(0);
  });

  it('removes "Secret 0" from page 0, keeps "Keep 0", leaves the other pages alone', async () => {
    const { file, elements } = await setup();
    const { blob } = await applyPageEdits(file, elements);
    const page0 = await pageText(blob, 0);
    expect(page0).not.toContain('Secret 0');
    expect(page0).toContain('Keep 0');
    expect(await pageText(blob, 1)).toContain('Secret 1');
    expect(await pageText(blob, 1)).toContain('Keep 1');
    expect(await pageText(blob, 2)).toContain('Secret 2');
    expect(await pageText(blob, 2)).toContain('Keep 2');
  });

  it('still lacks "Secret 0" with a blackout box on page 2 (the cover path)', async () => {
    const { file, elements } = await setup();
    const box = { id: 'b1', pageIndex: 2, type: 'blackout', left: 10, top: 10, width: 20, height: 20, color: '#000000' };
    const { blob } = await applyPageEdits(file, [...elements, box]);
    const page0 = await pageText(blob, 0);
    expect(page0).not.toContain('Secret 0');
    expect(page0).toContain('Keep 0');
  });
});

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { convertPdfToImages } from './toImage.js';

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

vi.mock('pdfjs-dist', async () => {
  return await import('pdfjs-dist/legacy/build/pdf.mjs');
});

describe('convertPdfToImages library integration with real fixtures', () => {
  let originalToBlob;
  let originalGetContext;

  beforeAll(() => {
    // Resolve absolute path to the node_modules legacy worker file with file:// protocol
    const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
    const workerUrl = pathToFileURL(workerPath).href;

    Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
      get() { return workerUrl; },
      set() { /* ignore */ },
      configurable: true,
    });

    // Stub canvas methods
    originalToBlob = HTMLCanvasElement.prototype.toBlob;
    originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type) {
      const bytes = Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));
      callback(new Blob([bytes], { type: type || 'image/png' }));
    };

    HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvasEl = this;
      const baseContext = {
        canvas: canvasEl,
        fillStyle: '',
        strokeStyle: '',
      };
      return new Proxy(baseContext, {
        get(target, prop) {
          if (prop in target) {
            return target[prop];
          }
          if (prop === 'getTransform') {
            return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
          }
          return vi.fn();
        },
      });
    };
  });

  afterAll(() => {
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, './__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  it('converts single page num-4.pdf into 1 image blob', async () => {
    const file = getFixtureFile('num-4.pdf');
    const images = await convertPdfToImages(file, { format: 'image/png' });

    expect(images.length).toBe(1);
    expect(images[0].pageNumber).toBe(1);
    expect(images[0].blob).toBeInstanceOf(Blob);
    expect(images[0].filename).toBe('num-4.png');
  });

  it('converts 5-page num-5.pdf into 5 image blobs', async () => {
    const file = getFixtureFile('num-5.pdf');
    const images = await convertPdfToImages(file, { format: 'image/jpeg', layout: 'separate' });

    expect(images.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(images[i].pageNumber).toBe(i + 1);
      expect(images[i].blob).toBeInstanceOf(Blob);
      expect(images[i].filename).toBe(`num-5-page-${i + 1}.jpg`);
    }
  });

  it('concatenates 5-page num-5.pdf into a single image blob', async () => {
    const file = getFixtureFile('num-5.pdf');
    const images = await convertPdfToImages(file, { format: 'image/png', layout: 'concatenated' });

    expect(images.length).toBe(1);
    expect(images[0].pageNumber).toBe(1);
    expect(images[0].blob).toBeInstanceOf(Blob);
    expect(images[0].filename).toBe('num-5.png');
  });
});

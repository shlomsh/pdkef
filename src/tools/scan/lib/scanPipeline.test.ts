import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectPhoto } from './scanPipeline.ts';
import { resetPageWorker } from './pageWork/offThread.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';

vi.mock('#lib/telemetry/errorReport.ts', { spy: true });

// forced: Node has no <img> or canvas, and a crashed worker leaves the main-thread path; these hold only sizes, every pixel gray
const sizes = new WeakMap<Blob, { width: number; height: number }>();
const urls = new Map<string, Blob>();
const createObjectURL = vi.spyOn(URL, 'createObjectURL');

const photo = (width: number, height: number) => {
  const blob = new Blob(['photo'], { type: 'image/jpeg' });
  sizes.set(blob, { width, height });
  return blob;
};

class FakeImage {
  src = '';
  naturalWidth = 0;
  naturalHeight = 0;
  async decode() {
    const { width, height } = sizes.get(urls.get(this.src) as Blob) as { width: number; height: number };
    this.naturalWidth = width;
    this.naturalHeight = height;
  }
}

class FakeCanvas {
  width = 300;
  height = 150;
  getContext = () => ({
    fillStyle: '',
    fillRect: () => {},
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).fill(128), width: this.width, height: this.height }),
  });
  toBlob(done: (blob: Blob) => void, type: string) {
    const blob = new Blob(['jpeg'], { type });
    sizes.set(blob, { width: this.width, height: this.height });
    done(blob);
  }
}

describe('a page worker that dies mid-job', () => {
  // The worker answers its probe, then dies on the first real job: the job finishes on the main thread.
  class DyingWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { preventDefault(): void }) => void) | null = null;
    terminate() {}
    postMessage(request: { id: number; job: { kind: string } }) {
      setTimeout(() => {
        if (request.job.kind === 'probe') this.onmessage?.({ data: { id: request.id, ok: true, value: true } });
        else this.onerror?.({ preventDefault: () => {} });
      });
    }
  }

  afterEach(() => {
    resetPageWorker();
    vi.unstubAllGlobals();
    createObjectURL.mockClear();
  });

  // forced: a worker that crashes mid-job
  it('finishes the job on the real main-thread path, and reports the worker failure once', async () => {
    resetPageWorker();
    vi.mocked(reportError).mockClear();
    vi.stubGlobal('Worker', DyingWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('Image', FakeImage);
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
    createObjectURL.mockImplementation((blob) => {
      const url = `blob:fake/${urls.size}`;
      urls.set(url, blob as Blob);
      return url;
    });
    const inspected = await inspectPhoto(photo(300, 400));
    expect([inspected.width, inspected.height]).toEqual([300, 400]);
    expect(sizes.get(inspected.preview)).toMatchObject({ width: 300, height: 400 });
    expect(createObjectURL).toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledTimes(1);
    // Later pages go straight to the main thread.
    await expect(inspectPhoto(photo(200, 100))).resolves.toMatchObject({ width: 200, height: 100 });
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

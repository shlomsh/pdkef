// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import Sortable from 'sortablejs';
import PdfImageToPdfTool from './PdfImageToPdfTool.tsx';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getPdfLib } from '../../lib/pdfLib.js';
import { formatFileSize } from '../../lib/format.js';
import { saveHandoff } from '../../lib/drafts/draftStore.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { recentActions, resetActionTrailForTests } from '../../lib/actionTrail.ts';
import { hebrewImageToPdfMessages } from './messages';
import { hebrewShellMessages } from '../../shell/shellMessages';

// Real images, so the real imagesToPdf builds real PDFs. Each PNG name gets its own width (a PDF page is
// as wide as its image), so a built PDF shows which images it holds and in what order.
const JPEG_BYTES = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/photo-1.jpg')));
const jpegWidth = (() => {
  for (let i = 2; i + 9 < JPEG_BYTES.length; i += 2 + ((JPEG_BYTES[i + 2] << 8) | JPEG_BYTES[i + 3])) {
    if (JPEG_BYTES[i] === 0xff && (JPEG_BYTES[i + 1] === 0xc0 || JPEG_BYTES[i + 1] === 0xc2)) return (JPEG_BYTES[i + 7] << 8) | JPEG_BYTES[i + 8];
  }
  throw new Error('no SOF marker in the JPEG fixture');
})();
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => (bytes.reduce((c, b) => crcTable[(c ^ b) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
// A valid width x 1 RGB PNG.
function pngBytes(width) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const frame = Buffer.alloc(8 + data.length + 4);
    frame.writeUInt32BE(data.length, 0);
    body.copy(frame, 4);
    frame.writeUInt32BE(crc32(body), 8 + data.length);
    return frame;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc(width * 3 + 1))),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}
const pngWidths = new Map();
const pngWidth = (name) => {
  if (!pngWidths.has(name)) pngWidths.set(name, 20 + 10 * pngWidths.size);
  return pngWidths.get(name);
};
// The width of the page an image of this name becomes.
const pageWidthFor = (name) => (name.endsWith('.jpg') ? jpegWidth : pngWidth(name));

function makeImageFile(name, type = 'image/png') {
  if (type === 'image/jpeg') return new File([JPEG_BYTES], name, { type });
  if (type === 'image/png') return new File([pngBytes(pngWidth(name))], name, { type });
  return new File(['not an image'], name, { type });
}

// Not a fake: imagesToPdf still builds the real PDF. The gate only lets one test hold a build open, or
// have one fail, which a real build gives no way to do on cue. Its calls are kept for the abort signal.
const { buildGate } = vi.hoisted(() => ({ buildGate: { next: null, calls: [] } }));
vi.mock('../../lib/imagesToPdf.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    imagesToPdf: async (...args) => {
      buildGate.calls.push(args);
      const hold = buildGate.next;
      buildGate.next = null;
      if (hold) await hold();
      return actual.imagesToPdf(...args);
    },
  };
});

const QUIET = { baseMs: 100, stepMs: 50, maxMs: 300, burstWindowMs: 1000 };

describe('PdfImageToPdfTool UI flow', () => {
  let container;
  let harness;
  // The PDFs built so far, in order (every build hands its result to a download URL).
  // Distinct PDFs: an order built before gets its blob back from the cache, under a new URL.
  const builtPdfs = () => [...new Set(harness.createdBlobs().filter((blob) => blob.type === 'application/pdf'))];
  // IndexedDB's own scheduling runs on the fake clock here, so a read or write is driven until it settles.
  const settled = async (promise) => {
    let done = false;
    let value;
    promise.then((result) => { done = true; value = result; });
    while (!done) await vi.advanceTimersByTimeAsync(5);
    return value;
  };
  // The page widths of a PDF: which images it holds, in order. Reading a jsdom Blob needs the clock to run.
  const pageWidthsOf = async (blob) => {
    const bytes = blob.arrayBuffer();
    await vi.advanceTimersByTimeAsync(10);
    const { PDFDocument } = await getPdfLib();
    const doc = await PDFDocument.load(await bytes, { parseSpeed: Infinity });
    return doc.getPages().map((page) => page.getWidth());
  };
  const expectBuilt = async (index, names) => expect(await pageWidthsOf(builtPdfs()[index])).toEqual(names.map(pageWidthFor));

  beforeEach(() => {
    harness = installToolHarness();
    vi.useFakeTimers();
    pngWidths.clear();
    buildGate.next = null;
    buildGate.calls = [];
    // jsdom's Blob has no arrayBuffer().
    if (!Blob.prototype.arrayBuffer) {
      Blob.prototype.arrayBuffer = function arrayBuffer() {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(this);
        });
      };
    }
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    harness.restore();
  });

  function mount(props = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfImageToPdfTool quietPolicy={QUIET} {...props} />, container);
    });
  }

  async function loadFiles(names = ['a.png', 'b.jpg']) {
    const input = container.querySelector('input[type="file"]');
    const files = names.map((n) => makeImageFile(n, n.endsWith('.jpg') ? 'image/jpeg' : 'image/png'));
    await act(async () => {
      setInputFiles(input, files);
    });
  }

  const wait = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const tileNames = () => Array.from(container.querySelectorAll('[data-page]')).map((el) => el.getAttribute('aria-label').split(',')[0]);
  const removeButtons = () => container.querySelectorAll('ul[aria-describedby="reorder-hint"] li > button[aria-label]');
  const downloadLink = () => container.querySelector('a[download]');
  const buttonByText = (text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim().includes(text));
  const press = (el, key) => act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

  it('renders the initial file dropper zone', () => {
    mount();
    const dropzone = container.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop images here');
  });

  it('shows one page tile per image, with a number, and no Convert button', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);

    const identity = container.querySelector('[data-file-identity]');
    expect(identity.textContent).toContain('2 images');
    expect(tileNames()).toEqual(['one.png', 'two.png']);
    expect(Array.from(container.querySelectorAll('[data-page] > span[aria-hidden="true"]')).map((b) => b.textContent)).toEqual(['1', '2']);
    expect(container.querySelector('[data-processing]')).toBeNull();
    expect(buttonByText('Try again')).toBeUndefined();
    expect(container.textContent).not.toContain('Convert');
    expect(container.querySelector('ul[aria-describedby="reorder-hint"] > li > button:not([aria-label])').textContent).toContain('Add images');
  });

  it('revokes every thumbnail URL on unmount, including ones added after the first render', async () => {
    const created = [];
    const revoked = [];
    const recordingCreate = URL.createObjectURL;
    URL.createObjectURL = (source) => {
      const url = recordingCreate(source);
      // Thumbnails only: the PDF's own URL is usePreparedOutput's, and it is revoked as soon as the order changes.
      if (source.type.startsWith('image/')) created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => { revoked.push(url); };
    mount();
    await loadFiles(['a.png']);
    await loadFiles(['b.jpg', 'c.png']);
    expect(created.length).toBeGreaterThanOrEqual(3);
    revoked.length = 0;

    act(() => render(null, container));

    for (const url of created) expect(revoked).toContain(url);
  });

  it('skips non-image files and shows a hint', async () => {
    mount();
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [makeImageFile('doc.pdf', 'application/pdf')]);
    });
    const hint = container.querySelector('[role="status"]');
    expect(hint.textContent).toContain('not a JPG or PNG');
  });

  it('builds at once on the first pick, without a button, and offers the download with its size', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await loadFiles(['doc1.png', 'doc2.jpg']);
    await wait(0);

    expect(builtPdfs()).toHaveLength(1);
    await expectBuilt(0, ['doc1.png', 'doc2.jpg']);
    expect(buildGate.calls[0][2]).toBeInstanceOf(AbortSignal);
    const link = downloadLink();
    expect(harness.blobForUrl(link.getAttribute('href'))).toBe(builtPdfs()[0]);
    expect(link.getAttribute('download')).toBe('doc1.pdf');
    expect(link.textContent).toContain('Download PDF');
    expect(link.textContent).toContain(formatFileSize(builtPdfs()[0].size));

    const shareButton = buttonByText('Share');
    expect(shareButton).not.toBeNull();
    await act(async () => shareButton.click());
    expect(nativeShare.share.mock.calls[0][0].files[0].name).toBe('doc1.pdf');
    nativeShare.restore();
  });

  it('builds a burst of changes once, after the quiet wait, and keeps the ready look meanwhile', async () => {
    mount();
    await loadFiles(['a.png', 'b.png', 'c.png']);
    await wait(0);
    expect(builtPdfs()).toHaveLength(1);

    await act(async () => { removeButtons()[0].click(); });
    await wait(20);
    await act(async () => { removeButtons()[0].click(); });
    await wait(60);
    expect(builtPdfs()).toHaveLength(1);
    // Silent: no ring, the button is still the download button.
    expect(downloadLink()).not.toBeNull();
    expect(container.textContent).not.toContain('Preparing');

    await wait(300);
    expect(builtPdfs()).toHaveLength(2);
    await expectBuilt(1, ['c.png']);
  });

  it('shows Preparing on a tap before ready, then delivers the download when the build lands', async () => {
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    let release;
    buildGate.next = () => new Promise((resolve) => { release = resolve; });
    await act(async () => { removeButtons()[1].click(); });

    await act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await wait(0);
    expect(container.querySelector('[data-processing]').textContent).toContain('Preparing');
    expect(clicks).not.toHaveBeenCalled();

    await act(async () => { release(); });
    await wait(0);
    expect(container.querySelector('[data-processing]')).toBeNull();
    expect(harness.blobForUrl(downloadLink().getAttribute('href'))).toBe(builtPdfs().at(-1));
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('does not re-announce an unchanged ready message on every Download tap', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    const live = () => container.querySelector('[role="status"][aria-live="polite"]').textContent;
    const tap = () => act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await tap();
    expect(live()).toBe('Your PDF is ready.');
    await tap();
    expect(live()).toBe('Your PDF is ready.');
  });

  it('records export on a tap that beat the build and download when it is delivered', async () => {
    resetActionTrailForTests();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    let release;
    buildGate.next = () => new Promise((resolve) => { release = resolve; });
    await act(async () => { removeButtons()[1].click(); });
    resetActionTrailForTests();
    await act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(recentActions()).toEqual(['export']);
    await act(async () => { release(); });
    await wait(0);
    expect(recentActions()).toEqual(['export', 'download']);
  });

  it('names the download from the editable output name', async () => {
    mount();
    await loadFiles(['holiday.jpg', 'b.png']);
    await wait(0);
    const nameEl = () => container.querySelector('[aria-label="PDF file name"]');
    expect(nameEl().textContent).toBe('holiday');

    await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await act(async () => { nameEl().textContent = 'Trip album'; });
    await press(nameEl(), 'Enter');
    await wait(0);

    expect(nameEl().textContent).toBe('Trip album');
    expect(downloadLink().getAttribute('download')).toBe('Trip album.pdf');
  });

  it('removes an image when its x is clicked, and changes the order key', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);
    await wait(0);
    expect(removeButtons()[0].getAttribute('aria-label')).toBe('Remove one.png');
    await act(async () => { removeButtons()[0].click(); });
    expect(tileNames()).toEqual(['two.png']);
    await wait(500);
    expect(builtPdfs()).toHaveLength(2);
    await expectBuilt(1, ['two.png']);
  });

  it('moves a tile with the arrow keys, announces it, and builds the new order', async () => {
    mount();
    await loadFiles(['one.png', 'two.png', 'three.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll('[data-page]');
    await press(tiles()[0], 'ArrowRight');
    expect(tileNames()).toEqual(['two.png', 'one.png', 'three.png']);
    expect(container.querySelector('[role="status"][aria-live="polite"]').textContent).toBe('one.png moved to position 2 of 3.');
    await press(tiles()[1], 'ArrowDown');
    expect(tileNames()).toEqual(['two.png', 'three.png', 'one.png']);
    await press(tiles()[2], 'ArrowRight');
    expect(tileNames()).toEqual(['two.png', 'three.png', 'one.png']);
    await press(tiles()[2], 'ArrowLeft');
    expect(tileNames()).toEqual(['two.png', 'one.png', 'three.png']);

    await wait(600);
    expect(builtPdfs()).toHaveLength(2);
    await expectBuilt(1, ['two.png', 'one.png', 'three.png']);
  });

  it('goes back to an order already built without building again', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll('[data-page]');
    await press(tiles()[0], 'ArrowRight');
    await wait(600);
    expect(builtPdfs()).toHaveLength(2);
    await press(tiles()[1], 'ArrowLeft');
    await wait(600);
    expect(builtPdfs()).toHaveLength(2);
    expect(harness.blobForUrl(downloadLink().getAttribute('href'))).toBe(builtPdfs()[0]);
  });

  it('orders by name from the Order menu, then shows Your order after a manual move', async () => {
    mount();
    await loadFiles(['b.png', 'c.png', 'a.png']);
    await wait(0);
    const trigger = () => container.querySelector('button[aria-haspopup="listbox"]');
    expect(trigger().getAttribute('aria-label')).toBe('Order images: Your order');
    await act(async () => trigger().click());
    await act(async () => { document.querySelector(`[role="option"][data-value="nameAsc"]`).click(); });
    expect(tileNames()).toEqual(['a.png', 'b.png', 'c.png']);
    expect(trigger().getAttribute('aria-label')).toBe('Order images: Name A–Z');

    await press(container.querySelector('[data-page]'), 'ArrowRight');
    expect(trigger().getAttribute('aria-label')).toBe('Order images: Your order');
  });

  it('attaches a Sortable instance to the page grid, with no handle and a touch hold', async () => {
    const createSpy = vi.spyOn(Sortable, 'create');
    mount();
    expect(createSpy).not.toHaveBeenCalled();
    await loadFiles(['a.png', 'b.png']);
    const grid = container.querySelector('ul[aria-describedby="reorder-hint"]');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(grid, expect.objectContaining({ delay: 150, delayOnTouchOnly: true }));
    expect(createSpy.mock.calls[0][1].handle).toBeUndefined();
  });

  it('shows the damaged-file message with Try again, which builds again', async () => {
    mount();
    buildGate.next = () => Promise.reject(new Error('bad image'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await loadFiles(['a.png']);
    await wait(0);
    expect(container.querySelector('[role="alert"]').textContent).toContain('A file may be damaged - remove it and try again.');
    const retry = buttonByText('Try again');
    expect(retry.textContent).toContain('Try again');
    await act(async () => { retry.click(); });
    await wait(0);
    expect(builtPdfs()).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(downloadLink()).not.toBeNull();
  });

  it('records what the person did, by name only, in order', async () => {
    resetActionTrailForTests();
    mount();
    await loadFiles(['a.png', 'b.jpg']);
    await wait(0);
    await act(async () => { removeButtons()[0].click(); });
    await wait(600);
    expect(recentActions()).toEqual(['add_files', 'remove_file']);
    await act(async () => { downloadLink().addEventListener('click', (e) => e.preventDefault()); downloadLink().click(); });
    expect(recentActions()).toEqual(['add_files', 'remove_file', 'export', 'download']);
  });

  it('loads photos handed off from the home page, in pick order', async () => {
    await settled(saveHandoff('image-to-pdf', {
      files: [
        { fileName: 'first.jpg', fileType: 'image/jpeg', fileBytes: JPEG_BYTES.slice().buffer },
        { fileName: 'second.png', fileType: 'image/png', fileBytes: pngBytes(pngWidth('second.png')).buffer },
      ],
    }));
    mount();
    await wait(50);
    // The island collected it: nothing is left parked under its key.
    expect(await settled(harness.takeHandoff('image-to-pdf'))).toBeNull();
    expect(tileNames()).toEqual(['first.jpg', 'second.png']);
  });

  const resultEvents = async () => {
    await harness.flush();
    return harness.usageEvents('tool_result_ready');
  };

  it('reports no result for background builds, and exactly one for a tap then delivery', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png', 'c.png']);
    await wait(0);
    await act(async () => { removeButtons()[0].click(); });
    await wait(600);
    await act(async () => { removeButtons()[0].click(); });
    await wait(600);
    expect(builtPdfs()).toHaveLength(3);
    expect(await resultEvents()).toHaveLength(0);

    await act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await wait(0);
    expect(await resultEvents()).toHaveLength(1);
  });

  const tapDownload = () => act(async () => { downloadLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

  it('does not deliver a stale tap after the only image is removed and a good one is added', async () => {
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail;
    buildGate.next = () => new Promise((_, reject) => { fail = () => reject(new Error('bad image')); });
    mount();
    await loadFiles(['a.png']);
    await wait(0);
    await tapDownload();
    await act(async () => { fail(); });
    await wait(0);
    await act(async () => { removeButtons()[0].click(); });
    await loadFiles(['b.png']);
    await wait(600);
    // The failed build made nothing; the good image's build is the only PDF.
    expect(builtPdfs()).toHaveLength(1);
    await expectBuilt(0, ['b.png']);
    expect(clicks).not.toHaveBeenCalled();
  });

  it('records export again on the first tap after Clear all', async () => {
    resetActionTrailForTests();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    buildGate.next = () => new Promise(() => {});
    mount();
    await loadFiles(['a.png']);
    await wait(0);
    const exports = () => recentActions().filter((a) => a === 'export').length;
    await tapDownload();
    expect(exports()).toBe(1);
    const byText = (t) => Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim() === t);
    await act(async () => { (byText('Clear all')[0] ?? byText('Clear')[0]).click(); });
    await act(async () => { byText('Clear all').at(-1).click(); });
    expect(container.querySelector('ul[aria-describedby="reorder-hint"]')).toBeNull();
    await loadFiles(['b.png']);
    await wait(0);
    await tapDownload();
    expect(exports()).toBe(2);
  });

  it('keeps the size and Share on screen while a change waits for quiet', async () => {
    const nativeShare = mockNativeFileShare();
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    const size = formatFileSize(builtPdfs()[0].size);
    expect(downloadLink().textContent).toContain(size);
    await act(async () => { removeButtons()[0].click(); });
    await wait(20);
    expect(downloadLink().textContent).toContain(size);
    const share = buttonByText('Share');
    expect(share).not.toBeNull();
    await act(async () => share.click());
    expect(nativeShare.share).not.toHaveBeenCalled();
    nativeShare.restore();
  });

  describe('Share through the shared download flow', () => {
    const shareButton = () => buttonByText('Share');
    const status = () => container.querySelector('p.sr-only[role="status"]').textContent.trim();

    it('says the PDF is still ready when the share sheet is canceled, and records nothing', async () => {
      resetActionTrailForTests();
      const nativeShare = mockNativeFileShare();
      nativeShare.share.mockRejectedValueOnce(Object.assign(new Error('cancel'), { name: 'AbortError' }));
      mount();
      await loadFiles(['a.png', 'b.png']);
      await wait(0);
      await act(async () => shareButton().click());
      await wait(0);
      expect(status()).toBe('Sharing canceled. Your PDF is still ready.');
      expect(recentActions()).not.toContain('share');
      nativeShare.restore();
    });

    it('says the sheet could not open when sharing fails, and records nothing', async () => {
      resetActionTrailForTests();
      const nativeShare = mockNativeFileShare();
      nativeShare.share.mockRejectedValueOnce(new Error('boom'));
      mount();
      await loadFiles(['a.png', 'b.png']);
      await wait(0);
      await act(async () => shareButton().click());
      await wait(0);
      expect(status()).toBe('Could not open the share sheet. Please try again.');
      expect(recentActions()).not.toContain('share');
      nativeShare.restore();
    });

    it('records a completed share by the name "share"', async () => {
      resetActionTrailForTests();
      const nativeShare = mockNativeFileShare();
      mount();
      await loadFiles(['a.png', 'b.png']);
      await wait(0);
      await act(async () => shareButton().click());
      await wait(0);
      expect(recentActions()).toContain('share');
      nativeShare.restore();
    });
  });

  it('keeps the same focused anchor while a tapped build is busy', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount();
    await loadFiles(['a.png', 'b.png']);
    await wait(0);
    buildGate.next = () => new Promise(() => {});
    await act(async () => { removeButtons()[1].click(); });
    const before = downloadLink();
    await act(async () => { before.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    await wait(0);
    const busy = container.querySelector('[data-processing]');
    expect(busy).toBe(before);
    expect(busy.tagName).toBe('A');
    expect(busy.getAttribute('aria-disabled')).toBe('true');
  });

  it('moves focus to the next tile after removing one, or the previous if it was last', async () => {
    mount();
    await loadFiles(['a.png', 'b.png', 'c.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll('[data-page]');
    await act(async () => { removeButtons()[1].click(); });
    expect(document.activeElement).toBe(tiles()[1]);
    expect(tiles()[1].getAttribute('aria-label')).toContain('c.png');
    await act(async () => { removeButtons()[1].click(); });
    expect(document.activeElement).toBe(tiles()[0]);
  });

  it('ignores arrow keys with a modifier, and does not swallow them at the ends', async () => {
    mount();
    await loadFiles(['one.png', 'two.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll('[data-page]');
    const fire = (el, init) => { const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); el.dispatchEvent(e); return e; };
    let e;
    await act(async () => { e = fire(tiles()[0], { key: 'ArrowRight', shiftKey: true }); });
    expect(e.defaultPrevented).toBe(false);
    expect(tileNames()).toEqual(['one.png', 'two.png']);
    await act(async () => { e = fire(tiles()[0], { key: 'ArrowLeft' }); });
    expect(e.defaultPrevented).toBe(false);
    await act(async () => { e = fire(tiles()[0], { key: 'ArrowRight' }); });
    expect(e.defaultPrevented).toBe(true);
  });

  it('keeps focus on the moved tile through repeated keyboard moves', async () => {
    mount();
    await loadFiles(['one.png', 'two.png', 'three.png']);
    await wait(0);
    const tiles = () => container.querySelectorAll('[data-page]');
    tiles()[0].focus();
    await press(tiles()[0], 'ArrowRight');
    expect(document.activeElement).toBe(tiles()[1]);
    await press(tiles()[1], 'ArrowRight');
    expect(document.activeElement).toBe(tiles()[2]);
  });

  it('announces a repeated message again', async () => {
    mount();
    await loadFiles(['b.png', 'a.png']);
    await wait(0);
    const live = () => container.querySelector('[role="status"][aria-live="polite"]').textContent;
    const trigger = () => container.querySelector('button[aria-haspopup="listbox"]');
    const pick = async (v) => {
      await act(async () => trigger().click());
      await act(async () => { document.querySelector(`[role="option"][data-value="${v}"]`).click(); });
    };
    await pick('nameAsc');
    const first = live();
    await pick('nameDesc');
    expect(live()).not.toBe(first);
    expect(live().trim()).toBe('Images reordered.');
  });
  // LOC: /he/image-to-pdf/ passes the Hebrew catalogue; nothing the island renders stays English.
  it('renders Hebrew controls, hints and announcements from the messages prop', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(<PdfImageToPdfTool messages={hebrewImageToPdfMessages} shellMessages={hebrewShellMessages} />, container);
    });
    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), [makeImageFile('b.png'), makeImageFile('a.png'), makeImageFile('c.txt', 'text/plain')]);
    });
    await act(async () => { vi.advanceTimersByTime(1000); });
    const text = container.textContent;
    for (const word of ['הוספת תמונות', 'סדר', 'עמודים', 'הורדת PDF']) expect(text).toContain(word);
    for (const english of ['Add images', 'Order', 'pages', 'Download PDF']) expect(text).not.toContain(english);
    expect(text).toContain('דילגנו על "c.txt"');
    expect(container.querySelector('[data-page]').getAttribute('aria-label')).toBe('b.png, עמוד 1 מתוך 2. גררו, או לחצו על מקש חץ כדי להזיז.');
    expect(container.querySelector('button[aria-label="הסרת b.png"]')).not.toBeNull();
    expect(container.querySelector('#reorder-hint').textContent).toBe(hebrewImageToPdfMessages.reorderHint);
    expect(container.querySelector('[role="status"][aria-live="polite"]').textContent).toBe('2 תמונות נוספו.');
  });

  describe('Clean it up as a scan', () => {
    const scanButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Clean it up as a scan'));

    it('appears once images are added, not before', async () => {
      mount();
      expect(scanButton()).toBeUndefined();
      await loadFiles(['a.png']);
      await wait(0);
      expect(scanButton()).toBeDefined();
    });

    it('saves every image in page order as a scan-to-pdf hand-off and navigates', async () => {
      const navigate = vi.fn();
      mount({ navigate });
      await loadFiles(['a.png', 'b.jpg']);
      await wait(0);
      await act(async () => scanButton().click());
      await wait(0);
      const record = await settled(harness.takeHandoff('scan-to-pdf'));
      expect(record.files.map((f) => [f.fileName, f.fileType])).toEqual([['a.png', 'image/png'], ['b.jpg', 'image/jpeg']]);
      expect(record.files[0].fileBytes.byteLength).toBeGreaterThan(0);
      expect(navigate).toHaveBeenCalledWith('/scan-to-pdf/');
    });

    it('says so and stays put when the save fails', async () => {
      const navigate = vi.fn();
      mount({ navigate });
      await loadFiles(['a.png']);
      await wait(0);
      // A browser with no usable IndexedDB (a locked-down window) cannot park the files.
      vi.stubGlobal('indexedDB', undefined);
      await act(async () => scanButton().click());
      await wait(0);
      expect(navigate).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Could not open Scan to PDF. Try again.');
    });

    it('speaks Hebrew on the Hebrew page', async () => {
      mount({ messages: hebrewImageToPdfMessages, shellMessages: hebrewShellMessages });
      await loadFiles(['a.png']);
      await wait(0);
      expect(scanButton()).toBeUndefined();
      expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent.includes(hebrewImageToPdfMessages.scanHandoff))).toBe(true);
    });
  });
});

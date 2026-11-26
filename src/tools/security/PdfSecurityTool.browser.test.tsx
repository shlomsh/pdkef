import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfSecurityTool from './PdfSecurityTool.tsx';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { COMPARE_PREVIEW_WIDTH, renderComparePreview } from '#lib/pdf/thumbnails.js';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { unlockPdf } from './lib/security.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import plainUrl from '../../lib/__fixtures__/encrypted/plain.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';

answerNetwork();

vi.mock('#lib/pdf/thumbnails.js', { spy: true });
vi.mock('./lib/security.js', { spy: true });

const fetchedBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const BYTES = { open: new Uint8Array(), ownerRestricted: new Uint8Array() };
beforeAll(async () => {
  BYTES.open = await fetchedBytes(plainUrl);
  BYTES.ownerRestricted = await fetchedBytes(ownerOnlyUrl);
});
const pdfFile = (bytes: Uint8Array, name = 'test.pdf') => new File([bytes as Uint8Array<ArrayBuffer>], name, { type: 'application/pdf' });

describe('PdfSecurityTool page preview drawn in Chromium', () => {
  let container: HTMLDivElement;
  let harness: BrowserToolHarness;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    vi.mocked(renderComparePreview).mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfSecurityTool />, container); });
  });

  afterEach(async () => {
    act(() => render(null, container));
    container.remove();
    vi.restoreAllMocks();
    await harness.restore();
  });

  const tagOf = () => container.querySelector('[data-security-preview] [data-preview-tag]')?.textContent;
  const previewSrc = () => container.querySelector('[data-security-preview] img')?.getAttribute('src');
  const frameBusy = () => container.querySelector('[data-page-frame]')?.getAttribute('aria-busy');
  const replaceDialogOpen = () => container.querySelector<HTMLDialogElement>('dialog[aria-labelledby="confirm-replace-title"]')?.open === true;
  const checked = () => {
    const text = container.querySelector('[role="status"]')?.textContent;
    return text !== undefined && !text.includes('Checking file');
  };
  const drain = () => act(async () => { await drainPromises(); });
  async function loadFile(file: File, { wait = true } = {}) {
    await act(async () => {
      setInputFiles(container.querySelector('input[type="file"]'), [file]);
      await drainPromises();
    });
    if (wait) await waitUntil(() => replaceDialogOpen() || checked());
  }
  const decodedSize = async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  };

  it('renders page 1 of the input at its real size, tagged Not protected, and keeps it, tagged Protected, after protecting', async () => {
    await loadFile(pdfFile(BYTES.open));
    await waitUntil(() => expect(tagOf()).toBe('Not protected'));
    await waitUntil(() => expect(previewSrc()).toBeTruthy());
    await drain();
    expect(renderComparePreview).toHaveBeenCalledTimes(1);
    expect(vi.mocked(renderComparePreview).mock.calls[0][0]).toBeInstanceOf(File);
    const src = previewSrc() ?? '';
    expect(src).toMatch(/^data:image\/png;base64,/);
    const size = await decodedSize(src);
    const { PDFDocument } = await getPdfLib();
    const page = (await PDFDocument.load(BYTES.open)).getPage(0).getSize();
    expect(size.width).toBe(COMPARE_PREVIEW_WIDTH);
    expect(size.height).toBe(Math.ceil((COMPARE_PREVIEW_WIDTH * page.height) / page.width));

    const input = container.querySelector<HTMLInputElement>('input[type="password"]');
    await act(async () => {
      if (!input) throw new Error('Expected a password field');
      input.value = 'secret';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitUntil(() => expect(tagOf()).toBe('Protected'));
    await waitUntil(() => expect(container.querySelector('[data-processing]')).toBeNull());
    await harness.flush();
    await drain();
    expect(previewSrc()).toBe(src);
    expect(renderComparePreview).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous image on screen until the unlocked output is drawn, and what is drawn no longer asks for a password', async () => {
    const file = pdfFile(BYTES.ownerRestricted);
    const original = file.arrayBuffer.bind(file);
    const unlockRead = Promise.withResolvers<void>();
    const unlockHeld = Promise.withResolvers<void>();
    file.arrayBuffer = () => {
      if (vi.mocked(unlockPdf).mock.results.at(-1)?.type !== 'incomplete') return original();
      unlockRead.resolve();
      return unlockHeld.promise.then(original);
    };
    await loadFile(file);
    await unlockRead.promise;
    await waitUntil(() => expect(previewSrc()).toBeTruthy());
    const firstSrc = previewSrc() ?? '';
    expect(firstSrc).toMatch(/^data:image\/png;base64,/);
    expect(await vi.mocked(renderComparePreview).mock.results[0].value).toBe(firstSrc);
    expect(frameBusy()).not.toBe('true');
    // The real render of the output runs in Chromium; the frame is watched, not held. Every change of the busy flag or
    // of the image is recorded with what the frame showed at that moment.
    const frame = container.querySelector('[data-page-frame]');
    if (!frame) throw new Error('Expected the preview frame');
    const seen: { busy: string | null; src: string | null | undefined }[] = [];
    const watcher = new MutationObserver(() => {
      seen.push({ busy: frame.getAttribute('aria-busy'), src: frame.querySelector('img')?.getAttribute('src') });
    });
    watcher.observe(frame, { attributes: true, attributeFilter: ['aria-busy', 'src'], childList: true, subtree: true });
    await act(async () => { unlockHeld.resolve(); });
    await waitUntil(() => {
      expect(tagOf()).toBe('Unlocked');
      expect(frameBusy()).not.toBe('true');
    });
    await drain();
    watcher.disconnect();
    expect(renderComparePreview).toHaveBeenCalledTimes(2);
    const busyRecords = seen.filter((record) => record.busy === 'true');
    expect(busyRecords.length).toBeGreaterThan(0);
    expect(busyRecords.every((record) => record.src === firstSrc)).toBe(true);
    const secondSrc = await vi.mocked(renderComparePreview).mock.results.at(-1)?.value;
    expect(previewSrc()).toBe(secondSrc);
    expect(tagOf()).toBe('Unlocked');
    const drawn = vi.mocked(renderComparePreview).mock.calls.at(-1)?.[0];
    if (!drawn) throw new Error('Expected a render of the output');
    expect(drawn).not.toBeInstanceOf(File);
    expect(await probeEncryption(await drawn.arrayBuffer())).toBe('open');
  });
});

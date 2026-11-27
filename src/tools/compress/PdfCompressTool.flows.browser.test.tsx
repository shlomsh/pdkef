import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import PdfCompressTool from './PdfCompressTool.tsx';
import type { PdfCompressToolProps } from './hooks/useCompressTool.ts';
import { englishCompressMessages, hebrewCompressMessages } from './messages';
import * as compressLib from './lib/compress.js';
import * as compressImageLib from './lib/compressImage.js';
import * as imagesLib from './lib/compressImages.js';
import * as thumbnails from '#lib/pdf/thumbnails.js';
import * as encryption from '#lib/pdf/pdfEncryption.ts';
import * as handoff from '#lib/handoff/sendHandoff.ts';
import { formatBytes } from './lib/resultView.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { mockNativeFileShare } from '../../test/support/mockFileShare.js';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { HeldFile } from '../../test/support/heldFile.ts';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import plainUrl from '../../lib/__fixtures__/encrypted/plain.pdf?url';

// The few Compress flows only a real browser shows: real pdf.js, the real canvas encoder, real dialogs
// and layout. Everything else about the tool is tested on the unit that owns it. A line marked
// `forced:` holds a call open or makes one fail, which no real file does.

answerNetwork();

vi.mock('./lib/compressImages.js', { spy: true });
vi.mock('./lib/compress.js', { spy: true });
vi.mock('./lib/compressImage.js', { spy: true });
vi.mock('#lib/pdf/thumbnails.js', { spy: true });
vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });

const actualImages = await vi.importActual<typeof imagesLib>('./lib/compressImages.js');
const actualPhoto = await vi.importActual<typeof compressImageLib>('./lib/compressImage.js');
const actualThumbnails = await vi.importActual<typeof thumbnails>('#lib/pdf/thumbnails.js');
const actualHandoff = await vi.importActual<typeof handoff>('#lib/handoff/sendHandoff.ts');

// Tests that are not about timing build 5ms after the last change instead of 1.5s.
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };

async function noiseBlob(width: number, height: number, type = 'image/jpeg', quality = 0.95): Promise<Blob> {
  const half = document.createElement('canvas');
  half.width = Math.ceil(width / 2);
  half.height = Math.ceil(height / 2);
  const halfContext = half.getContext('2d')!;
  const pixels = halfContext.createImageData(half.width, half.height);
  for (let offset = 0; offset < pixels.data.length; offset += 65536) crypto.getRandomValues(pixels.data.subarray(offset, offset + 65536));
  for (let at = 3; at < pixels.data.length; at += 4) pixels.data[at] = 255;
  halfContext.putImageData(pixels, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  context.drawImage(half, 0, 0, width, height);
  return new Promise((resolve) => { canvas.toBlob((blob) => resolve(blob!), type, quality); });
}

async function photoPdf({ pages = 3, size = [612, 792], width = 1200, height = 800 }: { pages?: number; size?: number[]; width?: number; height?: number } = {}) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  const image = await doc.embedJpg(new Uint8Array(await (await noiseBlob(width, height)).arrayBuffer()));
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage(size as [number, number]);
    if (i === 0) {
      page.drawImage(image, { x: 0, y: 0, width: size[0] / 2, height: size[1] / 3 });
      page.drawText('Quarterly report', { x: 50, y: size[1] - 90, size: 12 });
    }
  }
  return doc.save({ useObjectStreams: false });
}

async function flateImagePdf({ text = false } = {}) {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  if (text) page.drawText('Quarterly report', { x: 50, y: 700, size: 12 });
  const image = doc.context.flateStream(new Uint8Array(64 * 64 * 3), {
    Type: 'XObject', Subtype: 'Image', Width: 64, Height: 64, ColorSpace: 'DeviceRGB', BitsPerComponent: 8,
  });
  page.node.newXObject('Im1', doc.context.register(image));
  return doc.save({ useObjectStreams: false });
}

const BYTES: Record<string, Uint8Array> = {};
const PHOTOS: Record<string, { bytes: Uint8Array; type: string }> = {};
const fetched = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
beforeAll(async () => {
  BYTES.photo = await photoPdf();
  BYTES.photoWide = await photoPdf({ pages: 1, size: [792, 612] });
  BYTES.photoSingle = await photoPdf({ pages: 1 });
  BYTES.flateImage = await flateImagePdf();
  BYTES.flateImageText = await flateImagePdf({ text: true });
  BYTES.ownerOnly = await fetched(ownerOnlyUrl);
  BYTES.needsPassword = await fetched(needsPasswordUrl);
  BYTES.plain = await fetched(plainUrl);
  BYTES.badEncrypt = badEncryptPdf('Foo');
  BYTES.cannotDecrypt = badEncryptPdf('Standard');
  const photo = async (width: number, height: number) => ({ bytes: new Uint8Array(await (await noiseBlob(width, height)).arrayBuffer()), type: 'image/jpeg' });
  PHOTOS.landscape = await photo(1600, 1200);
  PHOTOS.portrait = await photo(900, 1200);
  PHOTOS.broken = { bytes: new Uint8Array(2000), type: 'image/jpeg' };
});

// A PDF with a malformed /Encrypt dictionary, so pdf.js's probe rejects with an error of its own. Under a
// handler pdf-lib does not know ('Foo') the build hands the file back untouched; under 'Standard' pdf-lib tries to
// carry its permissions across, fails to set up the decryption, and the build rejects.
function badEncryptPdf(filter: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [] /Count 0 >>',
    `<< /Filter /${filter} /V 9 /R 9 /O (x) /U (y) /P -4 >>`,
  ];
  let text = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = text.length;
    text += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 3 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

// A pick reads its PDF three times: the encryption probe and the analysis start at once, then the build and the
// original page. `passReads: 2` lets the first two through and holds the rest; no option holds them all. A read of
// `started` before the pick would miss the held one: the hold renews it.
const heldPdf = (shape: string, name: string, options?: { passReads?: number }) => new HeldFile(new Uint8Array(BYTES[shape]), name, options);

const makePdfFile = (name: string, shape = 'photo') => new File([BYTES[shape] as BlobPart], name, { type: 'application/pdf' });
const makeImageFile = (name: string, key = 'landscape') => new File([PHOTOS[key].bytes as BlobPart], name, { type: PHOTOS[key].type });

// forced: holds the next call to `fn` open until the test releases it, then runs the real one. Only the
// calls no file read can hold still use it: two consumers of one file released in a chosen order, a page
// rendered from a Blob the product makes, a photo decode (createImageBitmap reads no arrayBuffer), and a build
// whose file the analysis reads too, in an order that races, so no one read of the file is the build's.
function hold<A extends unknown[], R>(fn: (...args: A) => R, original: (...args: A) => R) {
  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: holds the next call to `fn` open until the test releases it, then runs the real one. Only the calls no file read can hold still use it: two consumers of one file released in a chosen order, a page rendered from a Blob the product makes, a photo decode (createImageBitmap reads no arrayBuffer), and a build whose file the analysis reads too, in an order that races, so no one read of the file is the build's.
  vi.mocked(fn).mockImplementationOnce((async (...args: A) => {
    started.resolve();
    await gate.promise;
    return original(...args);
  }) as unknown as typeof fn);
  return { started: started.promise, release: () => gate.resolve() };
}

describe('PdfCompressTool flows in a real browser', () => {
  let container: HTMLDivElement | null = null;
  let harness: BrowserToolHarness;
  let fileInput: HTMLInputElement;
  let nativeShare: ReturnType<typeof mockNativeFileShare> | undefined;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    for (const fn of [imagesLib.compressPdfImages, imagesLib.compressPdfImagesToTarget, compressLib.compressPdf, compressLib.compressPdfToTarget, compressImageLib.compressImageToTarget, thumbnails.renderComparePreview, thumbnails.renderThumbnail, encryption.probeEncryption, handoff.sendHandoff]) {
      vi.mocked(fn).mockReset();
    }
  });

  afterEach(async () => {
    vi.useRealTimers();
    unmount();
    nativeShare?.restore();
    nativeShare = undefined;
    vi.restoreAllMocks();
    await harness.restore();
  });

  const unmount = () => {
    if (!container) return;
    act(() => render(null, container!));
    container.remove();
    container = null;
  };
  // A second mount in one test is a fresh page of the tool; the file input is the one the dropzone keeps.
  const mount = (props: PdfCompressToolProps = {}) => {
    unmount();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { render(<PdfCompressTool quietPolicy={FAST_QUIET} {...props} />, container!); });
    fileInput = container.querySelector('input[type="file"]')!;
  };

  const $ = (selector: string) => container!.querySelector<HTMLElement>(selector);
  const $$ = (selector: string) => Array.from(container!.querySelectorAll<HTMLElement>(selector));
  const drain = () => act(async () => { await drainPromises(); });
  const statusOf = () => $('[data-compress-status]')?.getAttribute('data-compress-status');
  const settled = () => waitUntil(() => ['done', 'error'].includes(statusOf() ?? ''));
  const runNo = () => $('[data-compress-run]')?.getAttribute('data-compress-run') ?? '';

  // A pick starts the run on its own. By default this waits for the result; a promise or a check
  // says what to wait on instead (a run held open on purpose).
  const pick = async (file: File, until?: Promise<unknown> | (() => unknown)) => {
    await act(async () => { setInputFiles(fileInput, [file]); });
    if (!until) await settled();
    else if (typeof until === 'function') await waitUntil(until);
    else {
      await act(async () => { await until; });
      await drain();
    }
    return file;
  };
  const pickMany = async (files: File[], until?: Promise<unknown>) => {
    await act(async () => { setInputFiles(fileInput, files); });
    if (until) {
      await act(async () => { await until; });
      await drain();
    } else await settled();
  };
  const loadPdf = async (name: string, shape = 'photo', props: PdfCompressToolProps = {}) => {
    mount(props);
    return pick(makePdfFile(name, shape));
  };

  const radio = (name: string) => $$('[role="radio"]').find((r) => r.textContent!.trim() === name)!;
  const choose = async (name: string) => {
    await act(async () => { radio(name).click(); });
    await settled();
  };
  const preset = (label: string) => $$('button[aria-pressed]').find((b) => b.textContent!.trim() === label)!;
  const clickPreset = (label: string) => act(async () => { preset(label).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const findButton = (label: string) => $$('button').find((b) => b.textContent!.trim() === label);
  const flattenSwitch = () => $('[data-flatten-switch] input[type="checkbox"]') as HTMLInputElement | null;
  const flattenHint = () => $('[data-flatten-switch]')!.textContent!;
  const result = () => $('[data-result]')!;
  const resultText = () => [result(), $('[data-result-notes]')].filter(Boolean).map((p) => p!.textContent).join(' ');
  const stripName = () => $('[data-tool-shell]')!.textContent!;
  const downloadButton = () => $('[data-result-action] a[data-state]');
  const shareButton = () => $$('button').find((b) => b.textContent!.includes('Share'));
  const handoffLabels = () => $$('[data-result-action] button').map((b) => b.textContent!.trim());
  const downloaded = () => harness.blobForUrl(downloadButton()!.getAttribute('href'));
  const percentSmaller = (before: number, after: number) => Math.round((1 - after / before) * 100);
  const decodedSize = async (src: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight };
  };
  const isPngPreview = async (img: Element) => {
    const src = img.getAttribute('src')!;
    expect(src).toMatch(/^data:image\/png;base64,/);
    const { width, height } = await decodedSize(src);
    return width > 0 && height > 0;
  };
  const compareImages = () => $$('[data-compare-panel] img');
  const bothPagesDrawn = () => waitUntil(() => compareImages().length === 2);
  const orientation = async () => {
    const sizes = await Promise.all(compareImages().map((img) => decodedSize(img.getAttribute('src')!)));
    return sizes.map(({ width, height }) => (width > height ? 'landscape' : 'portrait'));
  };
  // The signal that a held page's stale result would have landed by now: its render is done and the
  // test has decoded the same picture itself, which the product's own decode of it started before.
  const pageLanded = async (call: number) => {
    const url = (await vi.mocked(thumbnails.renderComparePreview).mock.results[call].value) as string;
    await decodedSize(url);
    await act(async () => { await drainPromises(); });
  };
  const events = async (name: string) => {
    await harness.flush();
    return harness.usageEvents(name).length;
  };
  const noCompressButton = () => {
    const labels = $$('button').map((b) => b.textContent!.trim());
    expect(labels.some((l) => l === 'Compress PDF' || l === 'Compress Image' || l === 'Compress')).toBe(false);
  };
  const pagesOf = async (blob: Blob) => {
    const { PDFDocument } = await getPdfLib();
    return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
  };

  it('a PDF at Balanced compresses on its own, shows both pages and the finish, and counts only the Download tap', async () => {
    nativeShare = mockNativeFileShare();
    mount();
    // forced: the run and the original page are held open until the test lets them finish
    const run = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    const original = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);
    const file = await pick(makePdfFile('test_doc.pdf'), Promise.all([run.started, original.started]));

    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledWith(file, expect.objectContaining({ maxLongSidePx: 1600, quality: 0.6 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(statusOf()).toBe('processing');
    expect(radio('Balanced').getAttribute('aria-checked')).toBe('true');
    expect(stripName()).toContain('test_doc.pdf');
    // The sheet already holds Download in its ready look, with the size it knows: the build is silent.
    expect($('[data-result-sheet]')!.contains(downloadButton())).toBe(true);
    expect(downloadButton()!.textContent).toContain(formatBytes(file.size));
    expect(downloadButton()!.getAttribute('data-state')).toBe('ready');
    noCompressButton();
    // The slider's skeleton is the "still working" mark, and it never blocks the download row.
    expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull();
    expect(result().querySelectorAll('img')).toHaveLength(0);
    expect($('[data-result-sheet]')!.contains(downloadButton())).toBe(true);

    // The original page lands while the run is still going.
    await act(async () => { original.release(); });
    await waitUntil(() => result().querySelector('img') !== null);
    expect(statusOf()).toBe('processing');
    expect(await isPngPreview(result().querySelector('img')!)).toBe(true);
    expect($('[data-compare-skeleton]')).toBeNull();
    expect($('[data-compare-labels]')!.textContent).toContain(`Original · ${formatBytes(file.size)}`);
    expect($('[data-compare-labels]')!.textContent).toContain('Compressing');

    await act(async () => { run.release(); });
    await settled();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    const out = (await downloaded())!;
    expect(out.size).toBeLessThan(file.size);
    expect(await pagesOf(out)).toBe(3);
    expect($('[data-result-sheet]')!.contains(downloadButton())).toBe(true);
    noCompressButton();

    // The strip: before, arrow, after and the percent.
    const sizes = $('[data-tool-shell] [data-compress-sizes]')!.textContent!;
    expect(sizes).toContain(formatBytes(file.size));
    expect(sizes).toContain('→');
    expect(sizes).toContain(formatBytes(out.size));
    expect(sizes).toContain(`${percentSmaller(file.size, out.size)}% smaller`);
    expect(result().querySelector('[data-stats-title]')).toBeNull();
    expect(downloadButton()!.textContent).toContain(formatBytes(out.size));
    expect(downloadButton()!.textContent).not.toContain('smaller');

    // Two real PNG pages; the original was rendered once, the compressed page once.
    await bothPagesDrawn();
    await drain();
    for (const img of compareImages()) expect(await isPngPreview(img)).toBe(true);
    const renders = vi.mocked(thumbnails.renderComparePreview).mock.calls;
    expect(renders).toHaveLength(2);
    expect(renders.filter(([source]) => source === file)).toHaveLength(1);
    expect(renders.filter(([source]) => source instanceof Blob && !(source instanceof File))).toHaveLength(1);
    expect($('[data-compare-labels]')!.textContent).toContain(`Compressed · ${formatBytes(out.size)}`);
    expect(container!.textContent).toContain('Drag to compare page 1 with the original.');
    expect(container!.textContent).not.toContain('rest of the document');

    // Full screen is a real modal dialog at the viewport width; it closes and reopens from its cache.
    expect($('dialog[aria-label]')).toBeNull();
    await act(async () => { findButton('Full screen')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await waitUntil(() => expect($('dialog [role="slider"]')).not.toBeNull());
    const dialog = $('dialog[aria-label]') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.matches(':modal')).toBe(true);
    expect(renders).toHaveLength(4);
    expect(renders[2][1]).toBeGreaterThanOrEqual(900);
    for (const img of dialog.querySelectorAll('img')) expect(await isPngPreview(img)).toBe(true);
    const closeButton = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent!.trim() === 'Close')!;
    await act(async () => { closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(dialog.open).toBe(false);
    expect($('dialog [role="slider"]')).toBeNull();
    await act(async () => { findButton('Full screen')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect($('dialog [role="slider"]')).not.toBeNull();
    // A fresh render would start after the lazy import of the renderer: let that settle first.
    await import('#lib/pdf/thumbnails.js');
    await drain();
    expect(renders).toHaveLength(4);

    // The finish: Share first, then Sign and Merge, no note on a big saving.
    expect(handoffLabels()).toEqual(['Share', 'Sign', 'Merge']);
    expect(shareButton()).toBeDefined();
    expect(result().querySelector('[data-honest-note]')).toBeNull();
    expect($('[data-compress-warning]')).toBeNull();

    // The builds a pick and a level start are not funnel events; the Download tap is one of each.
    expect(await events('tool_operation_started')).toBe(0);
    expect(await events('tool_result_ready')).toBe(0);
    await act(async () => { downloadButton()!.click(); });
    await settled();
    expect(await events('tool_operation_started')).toBe(1);
    expect(await events('tool_result_ready')).toBe(1);

    await act(async () => { shareButton()!.click(); });
    const [shared] = nativeShare.share.mock.calls[0] as unknown as [ShareData];
    expect(shared.files![0].name).toBe('test_doc-compressed.pdf');

    // Back at a level already built: its result shows again at once and nothing is built.
    await choose('Smallest');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    const builds = runNo();
    await act(async () => { radio('Balanced').click(); });
    expect(statusOf()).toBe('done');
    expect(radio('Balanced').getAttribute('aria-checked')).toBe('true');
    await drain();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(2);
    expect(runNo()).toBe(builds);
    expect(downloadButton()!.textContent).toContain(formatBytes(out.size));
  });

  it.each([
    ['cancelled', Object.assign(new Error('closed'), { name: 'AbortError' }), englishCompressMessages.sharingCanceled],
    ['failed', new Error('no share target'), englishCompressMessages.shareError],
  ])('a share that is %s says so in the live region and records no share', async (_name, rejection, expected) => {
    nativeShare = mockNativeFileShare();
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the share sheet is closed, or fails, without sharing
    nativeShare.share.mockImplementationOnce(() => Promise.reject(rejection));
    await loadPdf('test_doc.pdf');
    await act(async () => { shareButton()!.click(); });
    await waitUntil(() => expect(container!.textContent).toContain(expected));
    expect($$('[role="status"]').some((line) => line.textContent === expected)).toBe(true);
    expect(nativeShare.share).toHaveBeenCalledTimes(1);
    expect(recentActions()).not.toContain('share');
  });

  it('a file replaced while its page and result were still loading never lands the old pages', async () => {
    mount();
    // forced: A's two pages are held open until the test lets them render
    const aOriginal = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);
    const aCompressed = hold(thumbnails.renderComparePreview, actualThumbnails.renderComparePreview);
    await pick(makePdfFile('preview_a.pdf', 'photoSingle'), () => $('[data-compare-skeleton]') !== null);
    await act(async () => { await Promise.all([aOriginal.started, aCompressed.started]); });
    expect($('[data-compare-skeleton]')).not.toBeNull();

    // B lands while A's pages are still loading, through the no-confirm path a Replace pick takes;
    // forced: B's run is held open, so B's own original is what shows meanwhile.
    const runB = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    await pick(makePdfFile('preview_b.pdf', 'photoWide'), () => result().querySelector('img') !== null && stripName().includes('preview_b.pdf'));
    await act(async () => { await runB.started; });
    const shownOriginal = async () => {
      const { width, height } = await decodedSize(result().querySelector('img')!.getAttribute('src')!);
      return width > height ? 'landscape' : 'portrait';
    };
    expect(await shownOriginal()).toBe('landscape');

    // A's stale original resolves while B runs: it must not replace B's.
    await act(async () => {
      aOriginal.release();
    });
    await pageLanded(0);
    expect(await shownOriginal()).toBe('landscape');

    await act(async () => { runB.release(); });
    await settled();
    await bothPagesDrawn();
    expect(await orientation()).toEqual(['landscape', 'landscape']);
    expect(container!.textContent).toContain('Drag to compare the original and the compressed page.');
    expect(container!.textContent).not.toContain('rest of the document');

    // A's stale compressed page resolves last: it must not overwrite B's comparison.
    await act(async () => {
      aCompressed.release();
    });
    await pageLanded(1);
    expect(await orientation()).toEqual(['landscape', 'landscape']);
    expect(stripName()).toContain('preview_b.pdf');
  });

  it('a file replaced mid-run by a locked PDF never compresses, a level click during the probe builds nothing, and a file with no PDF header is skipped', async () => {
    mount();
    // A's run is held open by hold() until the test lets it finish: the file's reads race the analysis, so no one read is the build's.
    const runA = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    await pick(makePdfFile('run_a.pdf'), runA.started);
    await act(async () => { radio('Smallest').click(); });
    await pick(makePdfFile('locked.pdf', 'needsPassword'), () => $('[data-needs-unlock]') !== null);
    await act(async () => {
      runA.release();
      await drainPromises();
    });
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect($('[data-needs-unlock]')).not.toBeNull();
    expect($('[data-compress-status]')).toBeNull();
    expect($('[role="status"].sr-only')!.textContent).toBe(englishCompressMessages.protectedNeedsPasswordTitle);

    // A level click while the encryption probe is out builds nothing; one run follows the answer.
    mount();
    vi.mocked(imagesLib.compressPdfImages).mockClear();
    // The encryption probe reads the file first, so a held file holds the probe until the test lets it answer
    const probing = heldPdf('photo', 'probing.pdf');
    await pick(probing, () => $('[data-tool-shell]') !== null);
    await act(async () => { await probing.started; });
    // The quiet timer (FAST_QUIET.baseMs, 5) is the product timer that would build after the click: fake only
    // setTimeout from here, so one advance reaches it (afterEach restores the real ones).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => { radio('Smallest').click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    expect(statusOf()).not.toBe('processing');
    await act(async () => { probing.release(); });
    await waitUntil(() => statusOf() === 'done', { dueFakeTimers: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(FAST_QUIET.baseMs + 1); await drainPromises(); });
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(imagesLib.compressPdfImages).mock.calls[0][1]).toEqual(expect.objectContaining({ maxLongSidePx: 1000, quality: 0.4 }));
    vi.useRealTimers();

    // A file with no PDF header is skipped, said once, and the tool is back to its empty state.
    mount();
    await act(async () => { setInputFiles(fileInput, [new File(['just some notes, not a PDF'], 'notes.pdf', { type: 'application/pdf' })]); });
    const skipLine = 'Skipped "notes.pdf" - not a PDF, JPG or PNG.';
    await waitUntil(() => container!.textContent!.includes('Skipped'));
    await drain();
    expect(container!.textContent).toContain(skipLine);
    expect($$('[role="status"]').some((line) => line.textContent === skipLine)).toBe(true);
    expect($('[data-compress-status]')).toBeNull();
    expect($('[role="radiogroup"]')).toBeNull();
    expect($('[data-dropzone]')).not.toBeNull();
    expect(container!.textContent).not.toMatch(/Download/);
    // Skipping is not a failure: no report, no failure event, and no engine ran for it.
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    for (const engine of [compressLib.compressPdf, compressLib.compressPdfToTarget, imagesLib.compressPdfImagesToTarget, compressImageLib.compressImageToTarget]) expect(engine).not.toHaveBeenCalled();
    expect(harness.reports()).toEqual([]);
    expect(await events('tool_operation_failed')).toBe(0);
  });

  it('Exact size lands real sizes at both targets, and the Hebrew page points the arrow left and isolates the size', async () => {
    mount({ messages: hebrewCompressMessages });
    // The first run is held open by hold(), so no result exists yet
    const run = hold(imagesLib.compressPdfImages, actualImages.compressPdfImages);
    const file = await pick(makePdfFile('big_scan.pdf'), run.started);
    expect($('[data-compress-sizes]')!.textContent).toBe(formatBytes(file.size));
    await act(async () => { run.release(); });
    await settled();
    const sizes = () => $('[data-compress-sizes]')!.textContent!;
    expect(sizes()).toContain('←');
    expect(sizes()).not.toContain('→');
    expect(downloadButton()!.textContent).toMatch(/⁦[^⁦⁩]*\d[^⁦⁩]*⁩/);

    await choose(hebrewCompressMessages.targetShort);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 100 }));
    expect((await downloaded())!.size).toBeLessThanOrEqual(100_000);
    expect(sizes()).toContain('←');
    expect(sizes()).not.toContain('→');
    expect(downloadButton()!.textContent).toMatch(/⁦[^⁦⁩]*\d[^⁦⁩]*⁩/);

    await clickPreset('500 KB');
    await settled();
    expect(preset('500 KB').getAttribute('aria-pressed')).toBe('true');
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenCalledTimes(2);
    expect(imagesLib.compressPdfImagesToTarget).toHaveBeenLastCalledWith(file, expect.objectContaining({ targetKB: 500 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();
    const out = (await downloaded())!.size;
    expect(out).toBeLessThanOrEqual(500_000);
    expect(out).toBeGreaterThan(100_000);

  });

  it('turning the pages into pictures hands back a PDF that is already as small as it gets, and unticking returns to the result already built', async () => {
    const file = await loadPdf('small_form.pdf', 'flateImage');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(flattenSwitch()).not.toBeNull();
    expect(resultText()).toContain('already compact, so making them smaller saved nothing');

    await act(async () => { flattenSwitch()!.click(); });
    await settled();
    expect(compressLib.compressPdf).toHaveBeenCalledTimes(1);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    const { rasterBytes } = await vi.mocked(compressLib.compressPdf).mock.results[0].value;
    expect(rasterBytes).toBeGreaterThan(file.size);
    const text = resultText();
    expect(text).toContain('Already as small as it gets');
    expect(text).toContain(`Turned into images, this PDF came to ${formatBytes(rasterBytes)}, more than the ${formatBytes(file.size)} it is now`);
    expect(text).toContain('As images');
    expect(text).toContain('None, original kept');
    expect(text).not.toContain('Compression rasterizes PDF pages');
    expect(statusOf()).toBe('done');
    expect(downloadButton()).toBeNull();
    expect(shareButton()).toBeUndefined();
    expect(findButton('Full screen')).toBeUndefined();
    expect($('[data-compare-panel]')).toBeNull();

    // Unticking is instant: the image-path result is still there and nothing is built again.
    await act(async () => { flattenSwitch()!.click(); });
    expect(statusOf()).toBe('done');
    expect(flattenSwitch()!.checked).toBe(false);
    await drain();
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
    expect(compressLib.compressPdf).toHaveBeenCalledTimes(1);
    expect(resultText()).toContain('already compact, so making them smaller saved nothing');
    expect(resultText()).not.toContain('As images');
    // This PDF has no text, so the switch's hint does not promise anything about selectable text.
    expect(flattenHint()).toContain(englishCompressMessages.flattenHintNoText);
    expect(flattenHint()).not.toContain(englishCompressMessages.flattenHint);

    // A PDF that has text says that text stops being selectable.
    await loadPdf('small_form_text.pdf', 'flateImageText');
    expect(flattenHint()).toContain(englishCompressMessages.flattenHint);
    expect(flattenHint()).not.toContain(englishCompressMessages.flattenHintNoText);
  });

  it('one photo shows its skeleton until it has decoded, then lands a real JPEG at the target with Share only', async () => {
    nativeShare = mockNativeFileShare();
    const decode = Promise.withResolvers<void>();
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the browser's image decode is held open until the test lets it finish
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(() => decode.promise);
    // forced: the run is held open until the test lets it finish
    const run = hold(compressImageLib.compressImageToTarget, actualPhoto.compressImageToTarget);
    mount();
    const photo = makeImageFile('photo.jpg');
    await pick(photo, run.started);
    await waitUntil(() => expect(result().querySelector('[data-compare-skeleton]')).not.toBeNull());
    expect(result().querySelector('img')).toBeNull();
    await act(async () => { decode.resolve(); });
    await waitUntil(() => result().querySelector('img') !== null);
    const shown = (await harness.blobForUrl(result().querySelector('img')!.getAttribute('src')))!;
    expect(new Uint8Array(await shown.arrayBuffer())).toEqual(new Uint8Array(await photo.arrayBuffer()));
    expect(result().querySelector('[data-compare-skeleton]')).toBeNull();
    await act(async () => { run.release(); });
    await settled();

    // The level picker is PDF-only; the photo runs at the 100 KB default.
    expect($('[role="radiogroup"]')).toBeNull();
    expect(stripName()).toContain('photo.jpg');
    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledTimes(1);
    expect(compressImageLib.compressImageToTarget).toHaveBeenLastCalledWith(photo, expect.objectContaining({ targetKB: 100 }));
    expect($$('[data-controls] button[aria-pressed]').map((b) => b.textContent)).toEqual(['50 KB', '100 KB', '200 KB', '500 KB']);
    expect(handoffLabels()).toEqual(['Share']);

    await clickPreset('50 KB');
    await settled();
    expect(preset('50 KB').getAttribute('aria-pressed')).toBe('true');
    expect(compressImageLib.compressImageToTarget).toHaveBeenCalledTimes(2);
    expect(compressImageLib.compressImageToTarget).toHaveBeenLastCalledWith(photo, expect.objectContaining({ targetKB: 50 }));
    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();
    const linked = (await downloaded())!;
    expect(linked.type).toBe('image/jpeg');
    expect(linked.size).toBeLessThanOrEqual(50_000);
    expect(downloadButton()!.getAttribute('download')).toBe('photo-compressed.jpg');
    const { width, height } = await createImageBitmap(linked);
    expect(resultText()).toContain('1600 × 1200');
    expect(resultText()).toContain(`${width} × ${height}`);
    expect(width).toBeLessThan(1600);
    expect(handoffLabels()).toEqual(['Share']);
    // The comparison is the two files themselves, with no rasterization, and the result's note sits with Download.
    expect(thumbnails.renderComparePreview).not.toHaveBeenCalled();
    expect(compareImages()).toHaveLength(2);
    const sides = await Promise.all(compareImages().map((img) => harness.blobForUrl(img.getAttribute('src'))));
    expect(sides[0]!.size).toBe(photo.size);
    expect(sides[0]!.type).toBe('image/jpeg');
    expect(sides[1]!.size).toBe(linked.size);
    expect(sides[1]!.type).toBe('image/jpeg');
    expect($('[data-result-notes]')!.textContent).toContain('once compressed, the output is a JPEG');
    expect($('[data-compress-status]')!.className).toContain('has-notes');
  });

  describe('several photos', () => {
    const rows = () => $$('li[data-batch-photo]');
    const toTarget = () => vi.mocked(compressImageLib.compressImageToTarget);
    const finishedAt = (kb: number) => waitUntil(() => statusOf() === 'done' && $('[data-batch-summary]')?.textContent!.includes(`${kb} KB`));

    it('two photos compress one at a time, drawing no thumbnail meanwhile, then open, step back and keep Escape inside Full screen', async () => {
      mount();
      const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
      const a = makeImageFile('a.jpg');
      const b = makeImageFile('b.jpg', 'portrait');
      // forced: the first photo is held open until the test lets it finish
      const first = hold(compressImageLib.compressImageToTarget, actualPhoto.compressImageToTarget);
      await pickMany([a, b], first.started);
      // One big image in memory at a time: no thumbnail is drawn while a photo compresses.
      expect(thumbnails.renderThumbnail).not.toHaveBeenCalled();
      // One photo at a time: the second has not started while the first is in flight.
      expect(toTarget()).toHaveBeenCalledTimes(1);
      expect(statusOf()).toBe('processing');
      await act(async () => { first.release(); });
      await settled();
      await waitUntil(() => rows().every((r) => r.querySelector('img')));

      expect($('[data-compress-batch]')).not.toBeNull();
      expect(rows()).toHaveLength(2);
      expect(toTarget()).toHaveBeenCalledTimes(2);
      expect(toTarget().mock.calls[0][0]).toBe(a);
      expect(toTarget().mock.calls[1][0]).toBe(b);
      expect(toTarget().mock.calls[0][1]).toEqual(expect.objectContaining({ targetKB: 100 }));
      expect(toTarget().mock.calls[1][1]).toEqual(expect.objectContaining({ targetKB: 100 }));
      expect(rows().map((r) => r.getAttribute('data-outcome'))).toEqual(['met', 'met']);
      // The strip names the set by its first photo and sums it, before and after.
      const outputs = await Promise.all(toTarget().mock.results.map((r) => r.value as Promise<{ blob: Blob }>));
      const after = outputs[0].blob.size + outputs[1].blob.size;
      expect($('[data-strip]')!.textContent).toContain('2 photos');
      const setSizes = $('[data-strip] [data-compress-sizes]')!.textContent!;
      expect(setSizes).toContain(formatBytes(a.size + b.size));
      expect(setSizes).toContain(formatBytes(after));
      expect(setSizes).toContain(`${percentSmaller(a.size + b.size, after)}% smaller`);
      expect($('[data-result]')).toBeNull();
      expect($$('[data-batch-save]')).toHaveLength(0);

      // Each photo is drawn from its original, once, and kept through a new target.
      const sources = () => rows().map((r) => r.querySelector('img')?.getAttribute('src'));
      expect(sources().every((src) => src?.startsWith('data:image/jpeg;base64,'))).toBe(true);
      const [wide, tall] = await Promise.all(sources().map((src) => decodedSize(src!)));
      expect(wide.width).toBeGreaterThan(wide.height);
      expect(tall.height).toBeGreaterThan(tall.width);
      expect(vi.mocked(thumbnails.renderThumbnail).mock.calls.map((c) => c[0])).toEqual([a, b]);
      const before = sources();
      await clickPreset('50 KB');
      await finishedAt(50);
      await drain();
      // The preset target recompresses every photo with that target.
      expect(toTarget()).toHaveBeenCalledTimes(4);
      expect(toTarget().mock.calls[2][1]).toEqual(expect.objectContaining({ targetKB: 50 }));
      expect(toTarget().mock.calls[3][1]).toEqual(expect.objectContaining({ targetKB: 50 }));
      expect(rows().map((r) => r.getAttribute('data-outcome'))).toEqual(['met', 'met']);
      expect(thumbnails.renderThumbnail).toHaveBeenCalledTimes(2);
      expect(sources()).toEqual(before);

      // The pick and the new target started compressions; only a Download tap is a funnel event.
      expect(await events('tool_operation_started')).toBe(0);
      expect(await events('tool_result_ready')).toBe(0);

      // Opening a photo brings its preview's bar into view.
      await act(async () => { $('[data-batch-open]')!.click(); });
      await settled();
      expect(scrolled.mock.contexts).toContain($('[data-batch-preview-bar]'));
      await act(async () => { $('[data-batch-back]')!.click(); });
      expect($('[data-result]')).toBeNull();

      // Escape in a real Full screen dialog stays in the preview; the held key's repeat after it too.
      await act(async () => { $$('[data-batch-open]')[1].click(); });
      await settled();
      const escape = () => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
      await act(async () => { $$('[data-result] button').find((button) => button.textContent!.includes('Full screen'))!.click(); });
      await settled();
      const dialog = document.querySelector('dialog[open]') as HTMLDialogElement;
      expect(dialog).not.toBeNull();
      expect(dialog.matches(':modal')).toBe(true);
      dialog.querySelector('button')!.focus();
      await escape();
      expect($('[data-batch-preview-bar]')).not.toBeNull();
      await act(async () => { Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent!.trim() === 'Close')!.click(); });
      expect(document.querySelector('dialog[open]')).toBeNull();
      await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat: true, bubbles: true, cancelable: true })); });
      expect($('[data-batch-preview-bar]')).not.toBeNull();
      $('[data-batch-next]')?.focus();
      await escape();
      expect($('[data-batch-preview-bar]')).toBeNull();
      expect(rows()).toHaveLength(2);
      expect(document.activeElement).toBe(rows()[1].querySelector('[data-batch-open]'));
    });

    it('a PDF picked among photos is named as left out and never compressed as a photo', async () => {
      mount();
      const pdf = makePdfFile('notes.pdf');
      await pickMany([makeImageFile('a.jpg'), pdf, makeImageFile('b.jpg', 'portrait')]);
      expect(rows()).toHaveLength(2);
      expect($('[data-batch] [data-batch-left-out]')!.textContent).toContain('notes.pdf');
      expect(toTarget().mock.calls.map((c) => c[0])).not.toContain(pdf);
      expect(toTarget()).toHaveBeenCalledTimes(2);
    });

    it('the strip shows the first photo that could be drawn, never a broken first file', async () => {
      mount();
      const bad = makeImageFile('bad.png', 'broken');
      const good = makeImageFile('good.jpg');
      await pickMany([bad, good]);
      await waitUntil(() => !!$('[data-strip] img'));
      const cover = (await harness.blobForUrl($('[data-strip] img')!.getAttribute('src')))!;
      expect(cover.size).toBe(good.size);
      expect(cover.size).not.toBe(bad.size);
    });
  });

  it('after a failed build, hovering or focusing the phone bar Download does not rebuild', async () => {
    // A file whose /Encrypt dictionary names the Standard handler but is malformed: the real pdf-lib fails to decrypt it.
    await loadPdf('flaky.pdf', 'cannotDecrypt');
    expect(statusOf()).toBe('error');
    const quiet = $('[data-quiet-download]');
    expect(quiet).not.toBeNull();
    await act(async () => {
      quiet!.dispatchEvent(new Event('pointerenter'));
      quiet!.dispatchEvent(new Event('focus'));
      await drainPromises();
    });
    // A rebuild would have left the error state at once; only Try again starts one.
    expect(statusOf()).toBe('error');
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
  });

  describe('a protected PDF', () => {
    const buttons = () => $$('button').map((b) => b.textContent!.trim());
    const loaded = () => $('[data-compress-status]') !== null;
    const shapeOf = (name: string) => ({ 'needs-password': 'needsPassword', 'owner-only': 'ownerOnly', plain: 'plain' }[name]!);
    const protectedFile = (name: string) => new File([BYTES[shapeOf(name)] as BlobPart], `${name}.pdf`, { type: 'application/pdf' });
    // The real classifier runs under pdf.js, which is slow to start: wait for the state the pick ends in.
    const pickProtected = async (file: File) => {
      await act(async () => { setInputFiles(fileInput, [file]); });
      await waitUntil(() => $('[data-needs-unlock]') !== null || ['done', 'error'].includes(statusOf() ?? ''));
      await drain();
    };
    const engines = () => [compressLib.compressPdf, compressLib.compressPdfToTarget, imagesLib.compressPdfImages, imagesLib.compressPdfImagesToTarget].map((fn) => vi.mocked(fn));

    it('a file that needs a password shows one quiet state, never compresses, and Unlock it parks the file and goes to Unlock', async () => {
      const t = hebrewCompressMessages;
      mount({ messages: t });
      // forced: a real navigation would take the test page away, so the hand-off gets a navigate callback
      const navigate = vi.fn();
      const sent = Promise.withResolvers<void>();
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a real navigation would take the test page away, so the hand-off gets a navigate callback
      vi.mocked(handoff.sendHandoff).mockImplementationOnce(async (target, payload, options) => {
        try { return await actualHandoff.sendHandoff(target, payload, { ...options, navigate }); } finally { sent.resolve(); }
      });
      await pickProtected(protectedFile('needs-password'));

      expect($('[data-needs-unlock="needs-password"]')).not.toBeNull();
      expect(container!.textContent).toContain(t.protectedNeedsPasswordTitle);
      expect(container!.textContent).toContain(t.protectedNeedsPasswordBody);
      expect(container!.textContent).not.toContain(englishCompressMessages.protectedNeedsPasswordTitle);
      expect(buttons()).toContain(t.protectedUnlockIt);
      expect($('[role="radiogroup"]')).toBeNull();
      expect(loaded()).toBe(false);
      expect($('[role="status"].sr-only')!.textContent).toBe(t.protectedNeedsPasswordTitle);
      expect(buttons().filter((text) => text.includes('Replace'))).toHaveLength(1);
      for (const engine of engines()) expect(engine).not.toHaveBeenCalled();
      expect(runNo()).toBe('');
      expect(harness.createdBlobs()).toHaveLength(0);
      expect(container!.textContent).not.toMatch(/Successfully|Download/);

      await act(async () => { $$('button').find((b) => b.textContent!.trim() === t.protectedUnlockIt)!.click(); });
      await sent.promise;
      expect(navigate).toHaveBeenCalledWith('/unlock/');
      expect(await harness.takeHandoff('unlock')).toEqual(expect.objectContaining({ from: 'compress', fileName: 'needs-password.pdf' }));
    });

    it('owner-only and plain PDFs compress on their own, and a probe that throws falls back to the normal state', async () => {
      for (const name of ['owner-only', 'plain']) {
        mount();
        await pickProtected(protectedFile(name));
        expect($('[data-needs-unlock]')).toBeNull();
        expect(loaded()).toBe(true);
        expect(statusOf()).toBe('done');
        expect(runNo()).toBe('1');
      }

      mount();
      // A malformed /Encrypt makes pdf.js's probe reject with an error of its own.
      await act(async () => { setInputFiles(fileInput, [new File([BYTES.badEncrypt as BlobPart], 'bad-encrypt.pdf', { type: 'application/pdf' })]); });
      await waitUntil(() => expect(statusOf()).toBe('done'));
      await drain();
      expect($('[data-needs-unlock]')).toBeNull();
      expect(loaded()).toBe(true);
      expect(statusOf()).toBe('done');
      expect(runNo()).toBe('1');
    });

    it('nothing runs until the password check answers, and an answer that lands after a newer pick is dropped', async () => {
      // The password check reads the file first, so a held file holds the check until the test releases it.
      const checking = heldPdf('plain', 'plain.pdf');
      mount();
      await act(async () => { setInputFiles(fileInput, [checking]); });
      await checking.started;
      await drain();
      // The strip is up while the check is out, but no build has started.
      expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
      expect(runNo()).toBe('0');
      expect(statusOf()).not.toMatch(/^(processing|done)$/);
      await act(async () => { checking.release(); });
      await waitUntil(() => expect(statusOf()).toBe('done'));
      await drain();
      expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
      expect(runNo()).toBe('1');

      // A stale "needs a password" answer, after a newer PDF pick and after a newer image pick, lands nothing.
      for (const [newer, builds] of [['pdf', 1], ['image', 0]] as const) {
        mount();
        vi.mocked(imagesLib.compressPdfImages).mockClear();
        // The first check (a password file) is held open by its file while a newer pick lands. The spy on its read
        // returns the product's own promise for it: the check carries on in that promise's continuation.
        const stale = heldPdf('needsPassword', 'needs-password.pdf');
        const staleRead = vi.spyOn(stale, 'arrayBuffer');
        await act(async () => { setInputFiles(fileInput, [stale]); });
        await stale.started;
        if (newer === 'pdf') await pickProtected(protectedFile('plain'));
        else await pickProtected(makeImageFile('photo.jpg'));
        await act(async () => {
          stale.release();
          // The product asked for its bytes before this line did, so its check has begun by the time this resolves.
          await staleRead.mock.results[0].value;
          await vi.mocked(encryption.probeEncryption).mock.results.at(-1)!.value;
          await drainPromises();
        });
        expect($('[data-needs-unlock]')).toBeNull();
        expect(statusOf()).toBe('done');
        expect(runNo()).toBe('1');
        // An image is never probed and builds on its own; a stale PDF build would have made the counter 2.
        expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(builds);
      }
    });
  });
});

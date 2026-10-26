// @ts-nocheck - test double wiring, same as the sibling PdfCompressTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PdfCompressTool from './PdfCompressTool.tsx';
import * as compressLib from './compress.js';
import * as imagesLib from './compressImages.js';
import * as imageLib from './compressImage.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { saveHandoff } from '../../lib/drafts/draftStore.js';
import { hebrewCompressMessages } from '../../i18n/toolMessages';
import { setInputFiles } from '../../test/setInputFiles.js';

// ENC-08: a PDF that needs a password is a precondition, not a failure. Compress shows one quiet state
// (src/shell/NeedsUnlock.tsx) in place of the level picker and the result. The real classifier runs
// under pdf.js's Node build against the real fixtures; only the browser seams are faked.

const fixtureFile = (name: string) =>
  new File([readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`))], `${name}.pdf`, { type: 'application/pdf' });

vi.mock('../../lib/pdfEncryption.ts', () => ({ probeEncryption: vi.fn() }));
vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: vi.fn(async () => null),
  saveHandoff: vi.fn(async () => true),
}));
vi.mock('./compress.js', () => ({
  compressPdf: vi.fn(() => Promise.resolve(new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }))),
  compressPdfToTarget: vi.fn(() => Promise.resolve({ blob: new Blob(['%PDF-1.4-target'], { type: 'application/pdf' }), metTarget: true })),
}));
vi.mock('./compressImage.js', () => ({
  compressImageToTarget: vi.fn(() => Promise.resolve({
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }), metTarget: true, width: 8, height: 6, originalWidth: 16, originalHeight: 12,
  })),
}));
vi.mock('./compressImages.js', () => ({
  IMAGE_LEVELS: { high: { maxLongSidePx: 1000, quality: 0.4 }, medium: { maxLongSidePx: 1600, quality: 0.6 }, low: { maxLongSidePx: 2400, quality: 0.8 } },
  compressPdfImages: vi.fn(() => Promise.resolve({ blob: new Blob(['%PDF-1.4-images'], { type: 'application/pdf' }), reason: 'smaller' })),
  compressPdfImagesToTarget: vi.fn(),
}));
vi.mock('../../lib/thumbnails.js', () => ({ renderComparePreview: vi.fn() }));

describe('PdfCompressTool with a protected PDF', () => {
  let container;

  beforeEach(async () => {
    input = undefined;
    const realProbe = (await vi.importActual('../../lib/pdfEncryption.ts')).probeEncryption;
    const legacyPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
    probeEncryption.mockImplementation((bytes) => realProbe(bytes, legacyPdfjs));
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  const mount = (props = {}) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfCompressTool {...props} />, container));
  };
  // The first input is the one the Dropzone keeps for the whole session, as the sibling suite also relies on.
  let input;
  // The real classifier runs under pdf.js, which is slow to start, so wait for the state the pick ends in:
  // the password state, or a finished run. `settle` false is a plain short wait, for a pick held open on purpose.
  const nap = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  const pick = async (file, settle = true) => {
    input ??= container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, [file]); });
    const end = Date.now() + 4000;
    const done = () =>
      container.querySelector('[data-needs-unlock]') !== null
      || ['done', 'error'].includes(container.querySelector('[data-compress-status]')?.getAttribute('data-compress-status'));
    while (settle && !done() && Date.now() < end) await nap(20);
    await nap(settle ? 20 : 200);
  };
  const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
  // The loaded state compresses on its own: it is "normal" once its layout is up and the run was made.
  const loaded = () => container.querySelector('[data-compress-status]') !== null;

  it('shows the password state and no level picker for a file that needs a password', async () => {
    mount();
    await pick(fixtureFile('needs-password'));

    expect(container.querySelector('[data-needs-unlock="needs-password"]')).not.toBeNull();
    expect(container.textContent).toContain('This PDF has a password');
    expect(container.textContent).toContain('then you can compress it');
    expect(buttons()).toContain('Unlock it');
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(loaded()).toBe(false);
    expect(container.querySelector('[role="status"].sr-only').textContent).toBe('This PDF has a password');
  });

  it('shows exactly one Replace button for a file that needs a password', async () => {
    mount();
    await pick(fixtureFile('needs-password'));

    expect(buttons().filter((text) => text.includes('Replace'))).toHaveLength(1);
  });

  it('never compresses a small file that needs a password', async () => {
    mount();
    await pick(fixtureFile('needs-password'));

    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();
    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    expect(imagesLib.compressPdfImagesToTarget).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/Successfully|Download/);
  });

  it('"Unlock it" parks the file for Unlock and goes there', async () => {
    mount();
    await pick(fixtureFile('needs-password'));
    const location = { href: '/compress/' };
    vi.stubGlobal('location', location);

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Unlock it').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(saveHandoff).toHaveBeenCalledWith('unlock', expect.objectContaining({ from: 'compress', fileName: 'needs-password.pdf' }));
    expect(location.href).toBe('/unlock/');
  });

  it.each(['owner-only', 'plain'])('%s reaches the normal state and compresses on its own', async (name) => {
    mount();
    await pick(fixtureFile(name));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
  });

  it('does not run until the password check has answered, then runs once', async () => {
    let release;
    probeEncryption.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    mount();
    await pick(fixtureFile('plain'), false);

    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
    await act(async () => { release('open'); });
    for (let i = 0; i < 100 && imagesLib.compressPdfImages.mock.calls.length === 0; i++) await nap(20);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
  });

  it('never probes an image, and compresses it on its own', async () => {
    mount();
    await pick(new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(probeEncryption).not.toHaveBeenCalled();
    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(imageLib.compressImageToTarget).toHaveBeenCalledTimes(1);
  });

  it('drops a probe result that lands after a newer pick', async () => {
    let release;
    probeEncryption.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    mount();
    await pick(fixtureFile('needs-password'));
    // A newer pick (a plain file, real probe) lands while the first probe is still out.
    await pick(fixtureFile('plain'));
    await act(async () => { release('needs-password'); await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
  });

  it('drops a probe result that lands after a newer image pick', async () => {
    let release;
    probeEncryption.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    mount();
    await pick(fixtureFile('needs-password'));
    // An image is never probed, so it starts no run of its own; the pick itself has to drop the old one.
    await pick(new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' }));
    await act(async () => { release('needs-password'); await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(imagesLib.compressPdfImages).not.toHaveBeenCalled();
  });

  it('falls back to the normal state when the probe throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeEncryption.mockRejectedValueOnce(new Error('pdfjs failed'));
    mount();
    await pick(fixtureFile('plain'));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(imagesLib.compressPdfImages).toHaveBeenCalledTimes(1);
  });

  it('shows the Hebrew title with the Hebrew messages', async () => {
    mount({ messages: hebrewCompressMessages });
    await pick(fixtureFile('needs-password'));

    expect(container.textContent).toContain(hebrewCompressMessages.protectedNeedsPasswordTitle);
    expect(container.textContent).not.toContain('This PDF has a password');
  });
});

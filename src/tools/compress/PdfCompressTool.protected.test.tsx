// @ts-nocheck - test double wiring, same as the sibling PdfCompressTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PdfCompressTool from './PdfCompressTool.tsx';
import * as compressLib from './compress.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { saveHandoff } from '../../lib/drafts/draftStore.js';
import { hebrewCompressMessages } from '../../i18n/toolMessages';
import { setInputFiles } from '../../test/setInputFiles.js';

// ENC-08: a PDF that needs a password is a precondition, not a failure. Compress shows one quiet state
// (src/shell/NeedsUnlock.tsx) in place of the options and the Compress button. The real classifier runs
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
vi.mock('./compressImage.js', () => ({ compressImageToTarget: vi.fn() }));
vi.mock('../../lib/thumbnails.js', () => ({ renderComparePreview: vi.fn(), getPdfjs: vi.fn() }));

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
  const pick = (file) => act(async () => {
    input ??= container.querySelector('input[type="file"]');
    setInputFiles(input, [file]);
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
  const compressButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Compress PDF');

  it('shows the password state and no Compress button for a file that needs a password', async () => {
    mount();
    await pick(fixtureFile('needs-password'));

    expect(container.querySelector('[data-needs-unlock="needs-password"]')).not.toBeNull();
    expect(container.textContent).toContain('This PDF has a password');
    expect(container.textContent).toContain('then you can compress it');
    expect(buttons()).toContain('Unlock it');
    expect(compressButton()).toBeUndefined();
    expect(container.textContent).not.toContain('Target Size');
    expect(container.querySelector('[role="status"].sr-only').textContent).toBe('This PDF has a password');
  });

  it('never compresses a small file that needs a password', async () => {
    mount();
    await pick(fixtureFile('needs-password'));

    expect(compressLib.compressPdf).not.toHaveBeenCalled();
    expect(compressLib.compressPdfToTarget).not.toHaveBeenCalled();
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

  it.each(['owner-only', 'plain'])('%s reaches the normal state with the Compress button', async (name) => {
    mount();
    await pick(fixtureFile(name));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(compressButton()).toBeDefined();
  });

  it('leaves an image alone and never probes it', async () => {
    mount();
    await pick(new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(probeEncryption).not.toHaveBeenCalled();
    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(buttons()).toContain('Compress Image');
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
    expect(compressButton()).toBeDefined();
  });

  it('falls back to the normal state when the probe throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    probeEncryption.mockRejectedValueOnce(new Error('pdfjs failed'));
    mount();
    await pick(fixtureFile('plain'));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(compressButton()).toBeDefined();
  });

  it('shows the Hebrew title with the Hebrew messages', async () => {
    mount({ messages: hebrewCompressMessages });
    await pick(fixtureFile('needs-password'));

    expect(container.textContent).toContain(hebrewCompressMessages.protectedNeedsPasswordTitle);
    expect(container.textContent).not.toContain('This PDF has a password');
  });
});

// @ts-nocheck - test double wiring, same as the sibling PdfCompressTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PdfCompressTool from './PdfCompressTool.tsx';
import * as compressLib from './lib/compress.js';
import * as imagesLib from './lib/compressImages.js';
import { hebrewCompressMessages } from './messages';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';

// ENC-08: a PDF that needs a password is a precondition, not a failure. Compress shows one quiet state
// (src/shell/NeedsUnlock.tsx) in place of the level picker and the result. The real classifier runs
// under pdf.js's Node build against the real fixtures; only the browser seams are faked: the probe wrapper
// (so a test can hold an answer open) and the page-preview renderer (pdf.js has to render). The compress
// engines, the draft store, analytics and the hand-off all run for real, read back through the harness.

const fixtureFile = (name: string) =>
  new File([readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`))], `${name}.pdf`, { type: 'application/pdf' });


// jsdom has no createImageBitmap, and the image path falls back to an <img> that never loads here; a
// stand-in decoder that reports a 16x12 photo is the one browser API the image run needs (the file is
// under the default target, so no canvas is reached).
const stubImageDecoder = () => vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 16, height: 12, close() {} })));

describe('PdfCompressTool with a protected PDF', () => {
  let container;
  let harness: ToolHarness;

  beforeEach(async () => {
    harness = installToolHarness();
    stubImageDecoder();
    input = undefined;
    const realProbe = (await vi.importActual('../../lib/pdfEncryption.ts')).probeEncryption;
    const legacyPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
    harness.pdfjs.probe.mockImplementation((bytes) => realProbe(bytes, legacyPdfjs));
  });

  // Call-through spies on the four PDF compress engines: only a call count proves "never ran".
  let engineSpies = [];
  const spyEngines = () => {
    engineSpies = [
      vi.spyOn(compressLib, 'compressPdf'),
      vi.spyOn(compressLib, 'compressPdfToTarget'),
      vi.spyOn(imagesLib, 'compressPdfImages'),
      vi.spyOn(imagesLib, 'compressPdfImagesToTarget'),
    ];
    return engineSpies;
  };

  afterEach(() => {
    engineSpies.forEach((spy) => spy.mockRestore());
    engineSpies = [];
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    harness.restore();
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
  // How many builds the tool has started for the loaded file (the layout's run counter), '' before it loads.
  const runs = () => container.querySelector('[data-compress-run]')?.getAttribute('data-compress-run') ?? '';
  const statusNow = () => container.querySelector('[data-compress-status]')?.getAttribute('data-compress-status');

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
    const engines = spyEngines();
    mount();
    await pick(fixtureFile('needs-password'));

    // No engine was ever called.
    for (const engine of engines) expect(engine).not.toHaveBeenCalled();

    // No build ever started: no run layout, no run counter, no result built into a download.
    expect(loaded()).toBe(false);
    expect(runs()).toBe('');
    expect(harness.createdBlobs()).toHaveLength(0);
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

    const parked = await harness.takeHandoff('unlock');
    expect(parked).toEqual(expect.objectContaining({ from: 'compress', fileName: 'needs-password.pdf' }));
    expect(location.href).toBe('/unlock/');
  });

  it.each(['owner-only', 'plain'])('%s reaches the normal state and compresses on its own', async (name) => {
    mount();
    await pick(fixtureFile(name));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('does not run until the password check has answered, then runs once', async () => {
    let release;
    harness.pdfjs.probe.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const [, , compressImagesSpy] = spyEngines();
    mount();
    await pick(fixtureFile('plain'), false);

    // The strip is up while the check is out, but no build has started.
    expect(compressImagesSpy).not.toHaveBeenCalled();
    expect(runs()).toBe('0');
    expect(statusNow()).not.toMatch(/^(processing|done)$/);
    await act(async () => { release('open'); });
    for (let i = 0; i < 100 && statusNow() !== 'done'; i++) await nap(20);
    expect(statusNow()).toBe('done');
    await nap(100);
    expect(compressImagesSpy).toHaveBeenCalledTimes(1);
    expect(runs()).toBe('1');
  });

  it('never probes an image, and compresses it on its own', async () => {
    mount();
    await pick(new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' }));

    expect(harness.pdfjs.probe).not.toHaveBeenCalled();
    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('drops a probe result that lands after a newer pick', async () => {
    let release;
    harness.pdfjs.probe.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    mount();
    await pick(fixtureFile('needs-password'));
    // A newer pick (a plain file, real probe) lands while the first probe is still out.
    await pick(fixtureFile('plain'));
    await act(async () => { release('needs-password'); await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('drops a probe result that lands after a newer image pick', async () => {
    let release;
    harness.pdfjs.probe.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const [, , compressImagesSpy] = spyEngines();
    mount();
    await pick(fixtureFile('needs-password'));
    // An image is never probed, so it starts no run of its own; the pick itself has to drop the old one.
    await pick(new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' }));
    await act(async () => { release('needs-password'); await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    // Only the image's own build ran: a PDF build from the dropped probe would have made the counter 2.
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
    expect(compressImagesSpy).not.toHaveBeenCalled();
  });

  it('falls back to the normal state when the probe throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.pdfjs.probe.mockRejectedValueOnce(new Error('pdfjs failed'));
    mount();
    await pick(fixtureFile('plain'));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('shows the Hebrew title with the Hebrew messages', async () => {
    mount({ messages: hebrewCompressMessages });
    await pick(fixtureFile('needs-password'));

    expect(container.textContent).toContain(hebrewCompressMessages.protectedNeedsPasswordTitle);
    expect(container.textContent).not.toContain('This PDF has a password');
  });
});

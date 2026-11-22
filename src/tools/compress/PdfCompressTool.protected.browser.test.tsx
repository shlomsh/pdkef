// @ts-nocheck - test double wiring, same as the sibling PdfCompressTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { drainPromises } from '../../test/support/drainPromises.ts';
import PdfCompressTool from './PdfCompressTool.tsx';
import { compressPdf, compressPdfToTarget } from './lib/compress.js';
import { compressPdfImages, compressPdfImagesToTarget } from './lib/compressImages.js';
import { hebrewCompressMessages } from './messages';
import { probeEncryption } from '#lib/pdf/pdfEncryption.ts';
import { sendHandoff } from '#lib/handoff/sendHandoff.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import plainUrl from '../../lib/__fixtures__/encrypted/plain.pdf?url';
import ownerOnlyUrl from '../../lib/__fixtures__/encrypted/owner-only.pdf?url';
import needsPasswordUrl from '../../lib/__fixtures__/encrypted/needs-password.pdf?url';

// ENC-08: a PDF that needs a password is a precondition, not a failure. Compress shows one quiet state
// (src/shell/NeedsUnlock.tsx) in place of the level picker and the result. The real classifier runs
// with pdf.js's shipped worker against the real fixtures; a test that has to hold an answer open forces
// the probe wrapper for that one call. The compress engines, the draft store, analytics and the hand-off
// all run for real, read back through the harness.

answerNetwork();

vi.mock('./lib/compress.js', { spy: true });
vi.mock('./lib/compressImages.js', { spy: true });
vi.mock('#lib/pdf/pdfEncryption.ts', { spy: true });
vi.mock('#lib/handoff/sendHandoff.ts', { spy: true });

const fixtureUrls = { 'needs-password': needsPasswordUrl, 'owner-only': ownerOnlyUrl, plain: plainUrl };
const fixtureFile = async (name: string) =>
  new File([await (await fetch(fixtureUrls[name])).arrayBuffer()], `${name}.pdf`, { type: 'application/pdf' });

const photoFile = async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 12;
  canvas.getContext('2d').fillRect(0, 0, 16, 12);
  const blob = await new Promise<Blob>((resolve) => { canvas.toBlob(resolve, 'image/jpeg'); });
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
};

const engines = () => [compressPdf, compressPdfToTarget, compressPdfImages, compressPdfImagesToTarget].map((fn) => vi.mocked(fn));
const resetSpies = () => {
  for (const fn of [...engines(), vi.mocked(probeEncryption), vi.mocked(sendHandoff)]) fn.mockReset();
};

describe('PdfCompressTool with a protected PDF', () => {
  let container;
  let harness: BrowserToolHarness;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    resetSpies();
    input = undefined;
  });

  afterEach(async () => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    await harness.restore();
  });

  const mount = (props = {}) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfCompressTool {...props} />, container));
  };
  // The first input is the one the Dropzone keeps for the whole session, as the sibling suite also relies on.
  let input;
  // The real classifier runs under pdf.js, which is slow to start, so wait for the state the pick ends in:
  // the password state, or a finished run. `settle` false is for a pick held open on purpose.
  const drain = () => act(async () => { await drainPromises(); });
  const pick = async (file, settle = true) => {
    input ??= container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, [file]); });
    const done = () =>
      container.querySelector('[data-needs-unlock]') !== null
      || ['done', 'error'].includes(container.querySelector('[data-compress-status]')?.getAttribute('data-compress-status'));
    if (settle) await waitUntil(done);
    await drain();
  };
  const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());
  // The loaded state compresses on its own: it is "normal" once its layout is up and the run was made.
  const loaded = () => container.querySelector('[data-compress-status]') !== null;
  // How many builds the tool has started for the loaded file (the layout's run counter), '' before it loads.
  const runs = () => container.querySelector('[data-compress-run]')?.getAttribute('data-compress-run') ?? '';
  const statusNow = () => container.querySelector('[data-compress-status]')?.getAttribute('data-compress-status');

  it('shows the password state and no level picker for a file that needs a password', async () => {
    mount();
    await pick(await fixtureFile('needs-password'));

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
    await pick(await fixtureFile('needs-password'));

    expect(buttons().filter((text) => text.includes('Replace'))).toHaveLength(1);
  });

  it('never compresses a small file that needs a password', async () => {
    mount();
    await pick(await fixtureFile('needs-password'));

    // No engine was ever called.
    for (const engine of engines()) expect(engine).not.toHaveBeenCalled();

    // No build ever started: no run layout, no run counter, no result built into a download.
    expect(loaded()).toBe(false);
    expect(runs()).toBe('');
    expect(harness.createdBlobs()).toHaveLength(0);
    expect(container.textContent).not.toMatch(/Successfully|Download/);
  });

  it('"Unlock it" parks the file for Unlock and goes there', async () => {
    const navigate = vi.fn();
    // forced: a real navigation would take the test page away, so the hand-off gets a navigate callback.
    const sent = Promise.withResolvers<void>();
    vi.mocked(sendHandoff).mockImplementationOnce(async (target, payload, options) => {
      try { return await (await vi.importActual<typeof import('#lib/handoff/sendHandoff.ts')>('#lib/handoff/sendHandoff.ts')).sendHandoff(target, payload, { ...options, navigate }); } finally { sent.resolve(); }
    });
    mount();
    await pick(await fixtureFile('needs-password'));

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Unlock it').click();
    });
    await sent.promise;
    expect(navigate).toHaveBeenCalledWith('/unlock/');

    const parked = await harness.takeHandoff('unlock');
    expect(parked).toEqual(expect.objectContaining({ from: 'compress', fileName: 'needs-password.pdf' }));
  });

  it.each(['owner-only', 'plain'])('%s reaches the normal state and compresses on its own', async (name) => {
    mount();
    await pick(await fixtureFile(name));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('does not run until the password check has answered, then runs once', async () => {
    let release;
    const probed = Promise.withResolvers<void>();
    // forced: the password check is held open until the test releases it.
    vi.mocked(probeEncryption).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; probed.resolve(); }));
    mount();
    await pick(await fixtureFile('plain'), false);
    await probed.promise;
    await drain();

    // The strip is up while the check is out, but no build has started.
    expect(vi.mocked(compressPdfImages)).not.toHaveBeenCalled();
    expect(runs()).toBe('0');
    expect(statusNow()).not.toMatch(/^(processing|done)$/);
    await act(async () => { release('open'); });
    await waitUntil(() => expect(statusNow()).toBe('done'));
    // The count is exact: drain so a second build would show.
    await drain();
    expect(vi.mocked(compressPdfImages)).toHaveBeenCalledTimes(1);
    expect(runs()).toBe('1');
  });

  it('never probes an image, and compresses it on its own', async () => {
    mount();
    await pick(await photoFile());

    expect(probeEncryption).not.toHaveBeenCalled();
    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('drops a probe result that lands after a newer pick', async () => {
    let release;
    const answer = new Promise((resolve) => { release = resolve; });
    const probed = Promise.withResolvers<void>();
    // forced: the first check (a password file) is held open while a newer pick lands.
    vi.mocked(probeEncryption).mockImplementationOnce(() => { probed.resolve(); return answer; });
    // The tool awaited `answer` first, so this runs after the tool has been handed the result.
    const handedOver = answer.then(() => {});
    mount();
    await pick(await fixtureFile('needs-password'), false);
    await probed.promise;
    // A newer pick (a plain file, real probe) lands while the first probe is still out.
    await pick(await fixtureFile('plain'));
    await act(async () => { release('needs-password'); await handedOver; await drainPromises(); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('drops a probe result that lands after a newer image pick', async () => {
    let release;
    const answer = new Promise((resolve) => { release = resolve; });
    const probed = Promise.withResolvers<void>();
    // forced: the first check (a password file) is held open while an image is picked.
    vi.mocked(probeEncryption).mockImplementationOnce(() => { probed.resolve(); return answer; });
    // The tool awaited `answer` first, so this runs after the tool has been handed the result.
    const handedOver = answer.then(() => {});
    mount();
    await pick(await fixtureFile('needs-password'), false);
    await probed.promise;
    // An image is never probed, so it starts no run of its own; the pick itself has to drop the old one.
    await pick(await photoFile());
    await act(async () => { release('needs-password'); await handedOver; await drainPromises(); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    // Only the image's own build ran: a PDF build from the dropped probe would have made the counter 2.
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
    expect(vi.mocked(compressPdfImages)).not.toHaveBeenCalled();
  });

  it('falls back to the normal state when the probe throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // forced: the probe rejects, which no file makes it do.
    vi.mocked(probeEncryption).mockRejectedValueOnce(new Error('pdfjs failed'));
    mount();
    await pick(await fixtureFile('plain'));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(loaded()).toBe(true);
    expect(statusNow()).toBe('done');
    expect(runs()).toBe('1');
  });

  it('shows the Hebrew title with the Hebrew messages', async () => {
    mount({ messages: hebrewCompressMessages });
    await pick(await fixtureFile('needs-password'));

    expect(container.textContent).toContain(hebrewCompressMessages.protectedNeedsPasswordTitle);
    expect(container.textContent).not.toContain('This PDF has a password');
  });
});

describe('PdfCompressTool with a file that is not a PDF', () => {
  let container;
  let harness: BrowserToolHarness;
  let input;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
    resetSpies();
    input = undefined;
  });

  afterEach(async () => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    await harness.restore();
  });

  const mount = () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfCompressTool />, container));
  };
  const loaded = () => container.querySelector('[data-compress-status]') !== null;
  const skipped = () => container.textContent.includes('Skipped');
  // Waits for the state the pick ends in: the skip line or the loaded layout (or `done`, for a second pick).
  const pick = async (file, done = () => skipped() || loaded()) => {
    input ??= container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, [file]); });
    await waitUntil(done);
    await act(async () => { await drainPromises(); });
  };
  const textFile = (bytes) => new File([bytes], 'notes.pdf', { type: 'application/pdf' });

  it('skips a file with no PDF header and goes back to the empty state', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await pick(textFile('just some notes, not a PDF'), skipped);

    expect(container.textContent).toContain('Skipped "notes.pdf" - not a PDF, JPG or PNG.');
    expect(loaded()).toBe(false);
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Download/);
    for (const engine of engines()) expect(engine).not.toHaveBeenCalled();
    await harness.flush();
    expect(harness.reports()).toHaveLength(0);
    expect(harness.usageEvents('tool_operation_failed')).toHaveLength(0);
  });

  it('loads a real PDF picked next and drops the skip line', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await pick(textFile('just some notes, not a PDF'), skipped);
    await pick(await fixtureFile('plain'), loaded);

    expect(container.textContent).not.toContain('Skipped');
    expect(loaded()).toBe(true);
  });

  it('does not skip a file that has a header but unreadable content', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mount();
    await pick(textFile('%PDF-1.7\nthis is junk, not objects'), loaded);

    expect(container.textContent).not.toContain('Skipped');
    expect(loaded()).toBe(true);
  });
});

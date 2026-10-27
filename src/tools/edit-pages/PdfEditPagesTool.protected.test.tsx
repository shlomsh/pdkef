import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import * as editPagesLib from './lib/editPages.js';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';

// A protected PDF is a precondition, not a failure: Edit Pages shows NeedsUnlock (src/shell/NeedsUnlock.tsx)
// in place of the page grid. The real classifier runs under pdf.js's Node build against the real fixtures.

const fixtureFile = (name: string) =>
  new File([readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`))], `${name}.pdf`, { type: 'application/pdf' });

describe('PdfEditPagesTool with a protected PDF', () => {
  let container: HTMLElement | null = null;
  let input;
  let harness;

  beforeEach(async () => {
    harness = installToolHarness();
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
    input = undefined;
    const realProbe = (await vi.importActual('../../lib/pdfEncryption.ts')).probeEncryption;
    const legacyPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
    harness.pdfjs.probe.mockImplementation((bytes) => realProbe(bytes, legacyPdfjs));
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container!));
      container.remove();
      container = null;
    }
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    harness.restore();
  });

  const nap = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  const pick = async (file) => {
    container ??= Object.assign(document.createElement('div'));
    if (!container!.isConnected) {
      document.body.appendChild(container!);
      act(() => render(<PdfEditPagesTool />, container!));
    }
    input ??= container!.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, [file]); });
    const end = Date.now() + 4000;
    while (
      !container!.querySelector('[data-needs-unlock]') && !container!.querySelector('ul[data-page-grid]')
      && Date.now() < end
    ) await nap(20);
    await nap(50);
  };
  const buttons = () => Array.from(container!.querySelectorAll('button')).map((b) => b.textContent.trim());

  it.each([
    ['needs-password', 'This PDF has a password'],
    ['owner-only', 'This PDF is protected'],
  ])('%s shows the unlock state and no page grid', async (name, title) => {
    const editPagesSpy = vi.spyOn(editPagesLib, 'editPages');
    await pick(fixtureFile(name));

    expect(container!.querySelector('[data-needs-unlock]')).not.toBeNull();
    expect(container!.textContent).toContain(title);
    expect(container!.textContent).toContain('edit it');
    expect(buttons()).toContain('Unlock it');
    expect(container!.querySelector('ul[data-page-grid]')).toBeNull();
    expect(container!.textContent).not.toMatch(/Could not edit|Undo|Download/);
    // Nothing was built, and the export never ran.
    expect(editPagesSpy).not.toHaveBeenCalled();
    expect(harness.createdBlobs()).toHaveLength(0);
    editPagesSpy.mockRestore();
  });

  it('records the kind each protected fixture gets', async () => {
    await pick(fixtureFile('needs-password'));
    expect(container!.querySelector('[data-needs-unlock]').getAttribute('data-needs-unlock')).toBe('needs-password');
    await pick(fixtureFile('owner-only'));
    expect(container!.querySelector('[data-needs-unlock]').getAttribute('data-needs-unlock')).toBe('owner-restricted');
  });

  it('"Unlock it" parks the file for Unlock and goes there', async () => {
    await pick(fixtureFile('needs-password'));
    const location = { href: '/organize-pdf/' };
    vi.stubGlobal('location', location);
    await act(async () => {
      Array.from(container!.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Unlock it').click();
    });
    await waitUntil(() => expect(location.href).toBe('/unlock/'));

    expect(await harness.takeHandoff('unlock')).toMatchObject({ from: 'edit-pdf', fileName: 'needs-password.pdf' });
    expect(location.href).toBe('/unlock/');
  });

  it('a normal file picked after a protected one shows the grid', async () => {
    await pick(fixtureFile('needs-password'));
    await pick(fixtureFile('plain'));

    expect(container!.querySelector('[data-needs-unlock]')).toBeNull();
    expect(container!.querySelector('ul[data-page-grid]')).not.toBeNull();
  });

  it('drops a probe result that lands after a newer pick', async () => {
    let release;
    harness.pdfjs.probe.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfEditPagesTool />, container!));
    input = container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, [fixtureFile('needs-password')]); });
    await pick(fixtureFile('plain'));
    await act(async () => { release('needs-password'); await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(container.querySelector('ul[data-page-grid]')).not.toBeNull();
  });
});

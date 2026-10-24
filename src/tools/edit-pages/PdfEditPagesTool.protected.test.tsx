// @ts-nocheck - test double wiring, same as the sibling PdfEditPagesTool.test.tsx
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PdfEditPagesTool from './PdfEditPagesTool.tsx';
import { editPages } from './editPages.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { saveHandoff } from '../../lib/drafts/draftStore.js';
import { setInputFiles } from '../../test/setInputFiles.js';

// A protected PDF is a precondition, not a failure: Edit Pages shows NeedsUnlock (src/shell/NeedsUnlock.tsx)
// in place of the page grid. The real classifier runs under pdf.js's Node build against the real fixtures.

const fixtureFile = (name: string) =>
  new File([readFileSync(path.resolve(__dirname, `../../lib/__fixtures__/encrypted/${name}.pdf`))], `${name}.pdf`, { type: 'application/pdf' });

vi.mock('../../lib/pdfEncryption.ts', () => ({ probeEncryption: vi.fn() }));
vi.mock('../../lib/drafts/draftStore.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeHandoff: vi.fn(async () => null),
  saveHandoff: vi.fn(async () => true),
}));
vi.mock('../../lib/thumbnails.js', () => ({
  openThumbnailSource: vi.fn(async (file) => ({
    file,
    pageCount: 1,
    render: vi.fn(async () => 'data:image/png;base64,fake'),
    destroy: vi.fn(async () => {}),
  })),
  renderThumbnail: vi.fn(() => Promise.resolve(null)),
  renderPdfThumbnails: vi.fn(async () => 0),
}));
vi.mock('./editPages.js', () => ({
  editPages: vi.fn(() => Promise.resolve(new Blob(['x'], { type: 'application/pdf' }))),
}));

describe('PdfEditPagesTool with a protected PDF', () => {
  let container;
  let input;

  beforeEach(async () => {
    input = undefined;
    const realProbe = (await vi.importActual('../../lib/pdfEncryption.ts')).probeEncryption;
    const legacyPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
    probeEncryption.mockImplementation((bytes) => realProbe(bytes, legacyPdfjs));
    window.URL.createObjectURL = vi.fn(() => 'blob:testurl');
    window.URL.revokeObjectURL = vi.fn();
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

  const nap = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
  const pick = async (file) => {
    container ??= Object.assign(document.createElement('div'));
    if (!container.isConnected) {
      document.body.appendChild(container);
      act(() => render(<PdfEditPagesTool />, container));
    }
    input ??= container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, [file]); });
    const end = Date.now() + 4000;
    while (
      !container.querySelector('[data-needs-unlock]') && !container.querySelector('ul[data-page-grid]')
      && Date.now() < end
    ) await nap(20);
    await nap(50);
  };
  const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent.trim());

  it.each([
    ['needs-password', 'This PDF has a password'],
    ['owner-only', 'This PDF is protected'],
  ])('%s shows the unlock state and no page grid', async (name, title) => {
    await pick(fixtureFile(name));

    expect(container.querySelector('[data-needs-unlock]')).not.toBeNull();
    expect(container.textContent).toContain(title);
    expect(container.textContent).toContain('edit it');
    expect(buttons()).toContain('Unlock it');
    expect(container.querySelector('ul[data-page-grid]')).toBeNull();
    expect(container.textContent).not.toMatch(/Could not edit|Undo|Download/);
    expect(editPages).not.toHaveBeenCalled();
  });

  it('records the kind each protected fixture gets', async () => {
    await pick(fixtureFile('needs-password'));
    expect(container.querySelector('[data-needs-unlock]').getAttribute('data-needs-unlock')).toBe('needs-password');
    await pick(fixtureFile('owner-only'));
    expect(container.querySelector('[data-needs-unlock]').getAttribute('data-needs-unlock')).toBe('owner-restricted');
  });

  it('"Unlock it" parks the file for Unlock and goes there', async () => {
    await pick(fixtureFile('needs-password'));
    const location = { href: '/edit-pdf/' };
    vi.stubGlobal('location', location);
    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Unlock it').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(saveHandoff).toHaveBeenCalledWith('unlock', expect.objectContaining({ from: 'edit-pdf', fileName: 'needs-password.pdf' }));
    expect(location.href).toBe('/unlock/');
  });

  it('a normal file picked after a protected one shows the grid', async () => {
    await pick(fixtureFile('needs-password'));
    await pick(fixtureFile('plain'));

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(container.querySelector('ul[data-page-grid]')).not.toBeNull();
  });

  it('drops a probe result that lands after a newer pick', async () => {
    let release;
    probeEncryption.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PdfEditPagesTool />, container));
    input = container.querySelector('input[type="file"]');
    await act(async () => { setInputFiles(input, [fixtureFile('needs-password')]); });
    await pick(fixtureFile('plain'));
    await act(async () => { release('needs-password'); await new Promise((resolve) => setTimeout(resolve, 50)); });

    expect(container.querySelector('[data-needs-unlock]')).toBeNull();
    expect(container.querySelector('ul[data-page-grid]')).not.toBeNull();
  });
});

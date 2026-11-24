import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, type ComponentProps } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect } from 'vitest';
import PdfEditPagesTool from '../PdfEditPagesTool.tsx';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import '../../../test/support/realPdfjs.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { buildPdf, healthy } from '../../../test/support/pdfPageTreeFixtures.ts';
import { setInputFiles } from '../../../test/support/setInputFiles.js';
import { waitUntil as waitFor } from '../../../test/support/waitUntil.ts';

/** @testSeam Under the test's own 5 s limit, so a missing result fails on its assertion rather than on the clock. */
export const waitUntil = (check: () => unknown) => waitFor(check, { timeout: 4000 });
/** @testSeam A real three-page PDF whose pages are told apart by width (200, 300, 400). */
export const pdf = (name = 'document.pdf', bytes: Uint8Array = healthy(), lastModified?: number) =>
  new File([new Uint8Array(bytes)], name, { type: 'application/pdf', lastModified });
/** @testSeam A real two-page PDF of the given page widths. */
export const twoPages = (first = 200, second = 300) => buildPdf({
  1: '<< /Type /Catalog /Pages 2 0 R >>',
  2: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${first} 500] >>`,
  4: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${second} 500] >>`,
});
/** @testSeam A real file from src/lib/__fixtures__/encrypted. */
export const encryptedFixture = (name: 'needs-password' | 'owner-only' | 'plain') =>
  pdf(`${name}.pdf`, new Uint8Array(readFileSync(resolve(process.cwd(), `src/lib/__fixtures__/encrypted/${name}.pdf`))));
/** @testSeam What a PDF holds: its pages' widths in order, their rotations, and whether each carries a font (a page number). */
export async function pagesOf(blob: Blob) {
  const { PDFDocument, PDFName } = await getPdfLib();
  const pages = (await PDFDocument.load(await blob.arrayBuffer())).getPages();
  return {
    count: pages.length,
    widths: pages.map((page) => page.getWidth()),
    rotations: pages.map((page) => page.getRotation().angle),
    fonts: pages.map((page) => Boolean(page.node.Resources()?.lookup(PDFName.of('Font')))),
  };
}
function found<T>(el: T | null | undefined, what: string): T {
  if (el === null || el === undefined) throw new Error(`Expected ${what}`);
  return el;
}

/** @testSeam Mounts the real island in jsdom for each test of the calling suite. */
export function useEditPagesTool() {
  const s = {
    harness: null as unknown as ToolHarness,
    container: null as unknown as HTMLDivElement,
    mount(props: ComponentProps<typeof PdfEditPagesTool> = {}) {
      act(() => { render(<PdfEditPagesTool {...props} />, s.container); });
    },
    text: () => s.container.textContent ?? '',
    cells: () => Array.from(s.container.querySelectorAll<HTMLElement>('ul[data-page-grid] > li[data-key]')),
    order: () => s.cells().map((cell) => cell.dataset.key),
    rotation: (index: number) => s.cells()[index].dataset.rotation ?? '0',
    skipped: () => s.cells().map((cell) => cell.hasAttribute('data-skipped')),
    heading: () => s.container.querySelector('#page-grid-heading')?.textContent ?? '',
    alert: () => s.container.querySelector('[role="alert"]'),
    needsUnlock: () => s.container.querySelector('[data-needs-unlock]'),
    buttons: () => Array.from(s.container.querySelectorAll('button')),
    button: (label: string) => found(s.buttons().find((button) => button.textContent?.trim() === label), `a "${label}" button`),
    skipButton: (number: number) => found(s.container.querySelector<HTMLButtonElement>(`[aria-label="Skip page ${number}"], [aria-label="Include page ${number}"]`), `the skip button of page ${number}`),
    rotateButton: (number: number) => found(s.container.querySelector<HTMLButtonElement>(`[aria-label="Rotate page ${number}"]`), `the rotate button of page ${number}`),
    undo: () => found(s.container.querySelector<HTMLButtonElement>('[aria-label="Undo last change"]'), 'Undo'),
    redo: () => found(s.container.querySelector<HTMLButtonElement>('[aria-label="Redo last undone change"]'), 'Redo'),
    /** The rail's Download element, the one with a state; the phone bar's quiet button has none. */
    downloadElement: () => found(s.container.querySelector<HTMLAnchorElement>('a[data-state]'), 'the Download element'),
    /** The file the Download element points at. */
    shownOutput: () => found(s.harness.blobForUrl(s.downloadElement().getAttribute('href')), 'a file behind the Download element'),
    click: (el: HTMLElement | null) => act(async () => { found(el, 'something to click').click(); }),
    drain: () => act(async () => { await drainPromises(); }),
    pick: (file: File) => act(async () => {
      setInputFiles(found(s.container.querySelector('input[type="file"]'), 'a file input'), [file]);
      await drainPromises();
    }),
    /** Picks a file and waits for what a person sees once it is read: the grid of that file, the unlock state or the error. */
    async load(file: File = pdf()) {
      if (!s.container.firstChild) s.mount();
      await s.pick(file);
      await s.settled(file.name);
    },
    settled: (name: string) => waitUntil(() => s.needsUnlock() !== null || s.alert() !== null
      || (s.cells().length > 0 && s.heading().includes(`${name.replace(/\.pdf$/, '')}_modified.pdf`))),
    replaceDialog: () => found(s.container.querySelector<HTMLDialogElement>('dialog[aria-labelledby="confirm-replace-title"]'), 'the replace dialog'),
    /** Picks another file and confirms the Replace dialog, as a person does. */
    async replaceWith(file: File) {
      await s.pick(file);
      await s.confirmReplace();
      await waitUntil(() => expect(s.text()).not.toContain('Loading PDF file structure'));
      await s.settled(file.name);
    },
    async confirmReplace() {
      expect(s.replaceDialog().open).toBe(true);
      await s.click(found(Array.from(s.replaceDialog().querySelectorAll('button')).find((b) => b.textContent === 'Replace file'), 'the confirm button'));
    },
    /** A pointer on the Download element asks for the build now instead of after the quiet wait. */
    press: () => act(async () => { s.downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); }),
    /** Asks for the build and waits until the built file, or its failure, is on the element. */
    async prepareNow() {
      await s.press();
      await waitUntil(() => expect(s.downloadElement().hasAttribute('href') || s.downloadElement().dataset.state === 'error').toBe(true));
    },
  };

  beforeEach(() => {
    s.harness = installToolHarness({ trackIndexedDb: true });
    s.container = document.createElement('div');
    document.body.append(s.container);
  });
  afterEach(async () => {
    act(() => { render(null, s.container); });
    s.container.remove();
    // The hand-off intake reads IndexedDB: it must end while the DOM still exists.
    await s.harness.settle();
    s.harness.restore();
  });
  return s;
}

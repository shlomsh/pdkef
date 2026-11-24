import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, type ComponentProps } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect } from 'vitest';
import PdfSplitTool from '../PdfSplitTool.tsx';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import '../../../test/support/realPdfjs.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { setInputFiles } from '../../../test/support/setInputFiles.js';
import { waitUntil as waitFor } from '../../../test/support/waitUntil.ts';

/** @testSeam Under the test's own 5 s limit, so a missing result fails on its assertion rather than on the clock. */
export const waitUntil = (check: () => unknown) => waitFor(check, { timeout: 4000 });
/** Tests that are not about timing build after 5 ms instead of the real 1500 ms. */
const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
/** @testSeam */
export const pdf = (name: string, bytes: Uint8Array) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
/** @testSeam A real five-page PDF whose pages are told apart by width (200 to 240). */
export async function fivePages() {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  for (const width of [200, 210, 220, 230, 240]) doc.addPage([width, 300]);
  return doc.save();
}
const FIXTURES = { 'needs-password': 'encrypted/needs-password.pdf', 'owner-restricted': 'encrypted/owner-only.pdf', 'three-pages': 'three-page-header.pdf' };
/** @testSeam A real file from src/lib/__fixtures__. */
export const fixtureFile = (kind: keyof typeof FIXTURES, name: string) =>
  pdf(name, new Uint8Array(readFileSync(resolve(process.cwd(), 'src/lib/__fixtures__', FIXTURES[kind]))));
/** @testSeam What a PDF holds: its pages in order, with each one's rotation and width. */
export async function pagesOf(blob: Blob) {
  const { PDFDocument } = await getPdfLib();
  const pages = (await PDFDocument.load(await blob.arrayBuffer())).getPages();
  return { count: pages.length, rotations: pages.map((page) => page.getRotation().angle), widths: pages.map((page) => page.getWidth()) };
}
function found<T>(el: T | null | undefined, what: string): T {
  if (el === null || el === undefined) throw new Error(`Expected ${what}`);
  return el;
}

/** @testSeam Mounts the real island in jsdom for each test of the calling suite. */
export function useSplitTool() {
  const saved: { name: string; blob: Blob | undefined }[] = [];
  const recordDownload = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[download]') : null;
    if (link) saved.push({ name: link.download, blob: s.harness.blobForUrl(link.getAttribute('href')) });
  };
  const s = {
    harness: null as unknown as ToolHarness,
    container: null as unknown as HTMLDivElement,
    /** Every download the page made, in order: its name and its bytes. */
    saved,
    mount(props: ComponentProps<typeof PdfSplitTool> = {}) {
      act(() => { render(<PdfSplitTool quietPolicy={FAST_QUIET} {...props} />, s.container); });
    },
    unmount() {
      act(() => { render(null, s.container); });
    },
    text: () => s.container.textContent ?? '',
    cells: () => Array.from(s.container.querySelectorAll<HTMLElement>('ul[data-page-grid] > li[data-key]')),
    heading: () => s.container.querySelector('#page-grid-heading'),
    headingText: () => s.heading()?.textContent ?? '',
    alert: () => s.container.querySelector('[role="alert"]'),
    needsUnlock: () => s.container.querySelector('[data-needs-unlock]'),
    findButton: (label: string) => Array.from(s.container.querySelectorAll('button')).find((b) => b.textContent === label),
    button: (label: string) => found(s.findButton(label), `a "${label}" button`),
    field: () => found(s.container.querySelector<HTMLInputElement>('#page-selector-input'), 'the page range field'),
    /** The rail's Download element, the one with a state; the phone bar's quiet button has none. */
    findDownload: () => s.container.querySelector<HTMLAnchorElement>('a[data-state]'),
    downloadElement: () => found(s.findDownload(), 'the Download element'),
    downloadText: () => s.downloadElement().textContent ?? '',
    /** The file the Download element points at. */
    shownOutput: () => found(s.harness.blobForUrl(s.downloadElement().getAttribute('href')), 'a file behind the Download element'),
    /** By position in the grid: a page's label carries its output number, which shifts when earlier pages are skipped. */
    skipButton: (n: number) => found(s.cells()[n - 1]?.querySelector<HTMLButtonElement>('[aria-label^="Skip page"], [aria-label^="Include page"]'), `the skip button at ${n}`),
    isSkipped: (n: number) => s.skipButton(n).getAttribute('aria-label')?.startsWith('Include') === true,
    radio: (label: string) => found(Array.from(s.container.querySelectorAll<HTMLElement>('[role="radio"]')).find((r) => r.textContent === label), `a "${label}" radio`),
    undo: () => found(s.container.querySelector<HTMLButtonElement>('[aria-label="Undo last change"]'), 'Undo'),
    redo: () => found(s.container.querySelector<HTMLButtonElement>('[aria-label="Redo last undone change"]'), 'Redo'),
    async click(el: HTMLElement) {
      await act(async () => { el.click(); });
      await s.harness.flush();
    },
    async type(value: string) {
      await act(async () => {
        s.field().value = value;
        s.field().dispatchEvent(new Event('input', { bubbles: true }));
      });
      await s.harness.flush();
    },
    drain: () => act(async () => { await drainPromises(); }),
    pickOnly: (file: File) => act(async () => {
      setInputFiles(found(s.container.querySelector('input[type="file"]'), 'a file input'), [file]);
      await drainPromises();
    }),
    /** Picks a file and waits for what a person sees once it is read: the grid, the unlock state or the load error. */
    async pick(file: File) {
      await s.pickOnly(file);
      await waitUntil(() => s.cells().length > 0 || s.needsUnlock() !== null || s.alert() !== null);
      await s.harness.flush();
    },
    replaceDialog: () => found(s.container.querySelector<HTMLDialogElement>('dialog[aria-labelledby="confirm-replace-title"]'), 'the replace dialog'),
    /** Picks another file and confirms the Replace dialog, as a person does. */
    async replaceWith(file: File) {
      await s.pickOnly(file);
      expect(s.replaceDialog().open).toBe(true);
      await s.click(found(Array.from(s.replaceDialog().querySelectorAll('button')).find((b) => b.textContent === 'Replace file'), 'the confirm button'));
      await waitUntil(() => {
        expect(s.headingText()).toContain(file.name);
        expect(s.cells()).not.toHaveLength(0);
      });
    },
    /** Mounts, picks the five-page PDF and waits for the quiet build (or, with a quiet policy of the test's own, for the grid). */
    async open(props: ComponentProps<typeof PdfSplitTool> = {}, name = 'open.pdf') {
      s.mount(props);
      await s.pick(pdf(name, await fivePages()));
      await waitUntil(() => {
        expect(s.cells()).not.toHaveLength(0);
        expect(s.downloadElement().dataset.state).toBe('ready');
        if (!props.quietPolicy) expect(s.downloadElement().hasAttribute('href')).toBe(true);
      });
    },
    /** Waits until the Download element is ready and says `text`. */
    readyWith: (text: string) => waitUntil(() => {
      expect(s.downloadElement().dataset.state).toBe('ready');
      expect(s.downloadText()).toContain(text);
      expect(s.downloadElement().hasAttribute('href') || s.downloadText().includes('each')).toBe(true);
    }),
    /** Waits until Download has delivered `count` files and says so. */
    delivered: (count: number) => waitUntil(() => {
      expect(s.saved).toHaveLength(count);
      expect(s.downloadElement().dataset.state).toBe('saved');
    }),
    /** How many usage events of this name were sent; flushed first, so a zero cannot pass before they landed. */
    async events(name: string) {
      await s.harness.flush();
      return s.harness.usageEvents(name).length;
    },
  };

  beforeEach(() => {
    s.harness = installToolHarness({ trackIndexedDb: true });
    s.container = document.createElement('div');
    document.body.append(s.container);
    saved.length = 0;
    document.addEventListener('click', recordDownload, { capture: true });
  });
  afterEach(async () => {
    document.removeEventListener('click', recordDownload, { capture: true });
    s.unmount();
    s.container.remove();
    // The hand-off intake reads IndexedDB: it must end while the DOM still exists.
    await s.harness.settle();
    s.harness.restore();
  });
  return s;
}

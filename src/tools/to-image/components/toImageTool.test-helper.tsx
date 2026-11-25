import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, type ComponentProps } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import PdfToImageTool from '../PdfToImageTool.tsx';
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
export const SLOW_QUIET = { baseMs: 400, stepMs: 0, maxMs: 400, burstWindowMs: 1 };
/** @testSeam A size in the Download element: the images are built. */
export const BUILT = /\d(\.\d)? ?(KB|MB)|B⁩/;
/** @testSeam */
export const pdfBytes = async (pages: number) => {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([200, 300]);
  return new Uint8Array(await doc.save());
};
/** @testSeam A real PDF of so many pages. */
export const pdf = async (name = 'report.pdf', pages = 5) => new File([await pdfBytes(pages)], name, { type: 'application/pdf' });
/** @testSeam A real file from src/lib/__fixtures__/encrypted. */
export const encryptedFixture = (kind: 'needs-password' | 'owner-only', name: string) =>
  new File([new Uint8Array(readFileSync(resolve(process.cwd(), `src/lib/__fixtures__/encrypted/${kind}.pdf`)))], name, { type: 'application/pdf' });
function found<T>(el: T | null | undefined, what: string): T {
  if (el === null || el === undefined) throw new Error(`Expected ${what}`);
  return el;
}

/** @testSeam Mounts the real island in jsdom for each test of the calling suite; the real converter draws on jsdom's real canvas. */
export function useToImageTool() {
  const s = {
    harness: null as unknown as ToolHarness,
    container: null as unknown as HTMLDivElement,
    mount(props: ComponentProps<typeof PdfToImageTool> = {}) {
      act(() => { render(<PdfToImageTool quietPolicy={FAST_QUIET} {...props} />, s.container); });
    },
    unmount() {
      act(() => { render(null, s.container); });
    },
    text: () => s.container.textContent ?? '',
    rail: () => found(s.container.querySelector<HTMLElement>('[data-rail]'), 'the rail'),
    cells: () => Array.from(s.container.querySelectorAll<HTMLElement>('ul[data-page-grid] > li[data-key]')),
    heading: () => s.container.querySelector('#page-grid-heading'),
    headingText: () => s.heading()?.textContent ?? '',
    alert: () => s.container.querySelector('[role="alert"]'),
    needsUnlock: () => s.container.querySelector('[data-needs-unlock]'),
    findButton: (label: string) => Array.from(s.container.querySelectorAll('button')).find((b) => b.textContent === label),
    button: (label: string) => found(s.findButton(label), `a "${label}" button`),
    findField: () => s.container.querySelector<HTMLInputElement>('#page-selector-input'),
    field: () => found(s.findField(), 'the page range field'),
    /** The rail's Download element, the one with a state; the phone bar's quiet link has none. */
    findDownload: () => s.container.querySelector<HTMLAnchorElement>('a[data-state]'),
    downloadElement: () => found(s.findDownload(), 'the Download element'),
    downloadText: () => s.findDownload()?.textContent ?? '',
    quietDownload: () => found(s.container.querySelector<HTMLAnchorElement>('[data-quiet-download]'), 'the phone Download'),
    saveLinks: () => Array.from(s.container.querySelectorAll<HTMLAnchorElement>('ul[data-page-grid] a[download]')),
    skipButton: (n: number) => found(s.cells()[n - 1]?.querySelector<HTMLButtonElement>('[aria-label^="Skip page"], [aria-label^="Include page"]'), `the skip button at ${n}`),
    radio: (label: string) => found(Array.from(s.rail().querySelectorAll<HTMLElement>('[role="radio"]')).find((r) => r.textContent === label), `a "${label}" radio`),
    undo: () => found(s.container.querySelector<HTMLButtonElement>('[aria-label="Undo last change"]'), 'Undo'),
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
    /** A pointer on the Download element asks for the build now instead of after the quiet wait. */
    press: () => act(async () => { s.downloadElement().dispatchEvent(new Event('pointerdown', { bubbles: true })); }),
    /** Several images are saved PART_GAP_MS (200) apart in useDownloadFlow.ts: run those gaps in the test that taps, so they cannot fire inside a later one. */
    async saveAll(tap: HTMLElement, images: number) {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      try {
        await s.click(tap);
        await vi.advanceTimersByTimeAsync((images - 1) * 200 + 1);
      } finally {
        vi.useRealTimers();
      }
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
    built: () => waitUntil(() => expect(s.downloadText()).toMatch(BUILT)),
    /** Mounts, picks a file and waits for the quiet build, when one comes on its own. */
    async open(pages = 5, props: ComponentProps<typeof PdfToImageTool> = {}, file?: File) {
      s.mount(props);
      await s.pick(file ?? await pdf('report.pdf', pages));
      await waitUntil(() => expect(s.findDownload()).not.toBeNull());
      if (!props.quietPolicy && pages <= 30) await s.built();
      await s.harness.flush();
    },
    replaceDialog: () => found(s.container.querySelector<HTMLDialogElement>('dialog[aria-labelledby="confirm-replace-title"]'), 'the replace dialog'),
    /** Picks another file and confirms the Replace dialog, as a person does. */
    async replaceWith(file: File) {
      await s.pickOnly(file);
      expect(s.replaceDialog().open).toBe(true);
      await s.click(found(Array.from(s.replaceDialog().querySelectorAll('button')).find((b) => b.textContent === 'Replace file'), 'the confirm button'));
      await waitUntil(() => {
        expect(s.headingText()).toContain(file.name.replace(/\.pdf$/, ''));
        expect(s.downloadElement().dataset.state).not.toBe('preparing');
      });
    },
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
  });
  afterEach(async () => {
    s.unmount();
    s.container.remove();
    // The hand-off intake reads IndexedDB: it must end while the DOM still exists.
    await s.harness.settle();
    s.harness.restore();
  });
  return s;
}

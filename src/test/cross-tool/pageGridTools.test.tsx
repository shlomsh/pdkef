import { render, type VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveHandoff } from '#lib/drafts/draftStore.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import PdfSplitTool from '../../tools/split/PdfSplitTool.tsx';
import PdfToImageTool from '../../tools/to-image/PdfToImageTool.tsx';
import PdfEditPagesTool from '../../tools/edit-pages/PdfEditPagesTool.tsx';
import { installToolHarness, type ToolHarness } from '../harness/toolHarness.ts';
import '../support/realPdfjs.ts';
import { setInputFiles } from '../support/setInputFiles.js';
import { waitUntil as waitFor } from '../support/waitUntil.ts';

// What Split, PDF to Image and Edit Pages share by construction (the dropzone and the file intake): each tool
// wires it, so each tool runs the same cases. The Replace file case stays in pageGridTools.browser.test.tsx.

const txt = (name: string) => new File(['x'], name, { type: 'text/plain' });

const TOOLS: { name: string; element: () => VNode }[] = [
  { name: 'Split', element: () => <PdfSplitTool /> },
  { name: 'PDF to Image', element: () => <PdfToImageTool /> },
  { name: 'Edit Pages', element: () => <PdfEditPagesTool /> },
];

describe.each(TOOLS)('$name on the shared page workspace', ({ element }) => {
  let container: HTMLElement | null = null;
  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
  });

  afterEach(async () => {
    const host = container;
    if (host) {
      act(() => render(null, host));
      host.remove();
      container = null;
    }
    // The hand-off intake's IndexedDB read must end while the DOM still exists.
    await harness.settle();
    harness.restore();
  });

  function mount() {
    const host = document.createElement('div');
    container = host;
    document.body.appendChild(host);
    act(() => render(element(), host));
    return host;
  }

  it('renders the initial dropzone', () => {
    const root = mount();
    const dropzone = root.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone!.textContent).toContain('Drop PDF here');
  });

  it('lists the files it skipped, one by name and several by count', async () => {
    const root = mount();
    const note = () => root.querySelector('[role="status"]')?.textContent;
    await act(async () => { setInputFiles(root.querySelector('input[type="file"]'), [txt('2025-notes.txt')]); });
    expect(note()).toBe('Skipped “2025-notes.txt” - not a PDF.');
    await act(async () => { setInputFiles(root.querySelector('input[type="file"]'), [txt('a.txt'), txt('b.txt')]); });
    expect(note()).toBe('Skipped 2 files - not PDFs.');
  });
});

const waitUntil = (check: () => unknown) => waitFor(check, { timeout: 4000 });
const FAST_QUIET: QuietPolicy = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const FIVE_PAGES: Uint8Array = await (async () => {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  for (const width of [200, 210, 220, 230, 240]) doc.addPage([width, 300]);
  return doc.save();
})();

// `field`: the tool has the page-range field. `noun`: what its heading counts. Five pages each.
interface PageGridTool {
  name: string;
  element: () => VNode;
  handoff: string;
  noun: string;
  handed: string;
  field: boolean;
}

const OPENED: PageGridTool[] = [
  { name: 'Split', element: () => <PdfSplitTool quietPolicy={FAST_QUIET} />, handoff: 'split', noun: 'pages', handed: 'extracted_handed.pdf', field: true },
  { name: 'PDF to Image', element: () => <PdfToImageTool quietPolicy={FAST_QUIET} />, handoff: 'pdf-to-image', noun: 'images', handed: 'handed-page-N.png', field: true },
  { name: 'Edit Pages', element: () => <PdfEditPagesTool />, handoff: 'edit-pdf', noun: 'pages', handed: 'handed_modified.pdf', field: false },
];

describe.each(OPENED)('$name with a PDF opened on the shared page workspace', ({ element, handoff, noun, handed, field: hasField }) => {
  let container: HTMLElement | null = null;
  let harness: ToolHarness;

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
  });

  afterEach(async () => {
    const host = container;
    if (host) {
      act(() => render(null, host));
      host.remove();
      container = null;
    }
    await harness.settle();
    harness.restore();
  });

  function mount() {
    const host = document.createElement('div');
    container = host;
    document.body.appendChild(host);
    act(() => render(element(), host));
  }
  const root = () => container!;
  const input = () => root().querySelector('input[type="file"]');
  const pdf = (name = 'report.pdf') => new File([new Uint8Array(FIVE_PAGES)], name, { type: 'application/pdf' });
  async function open() {
    mount();
    await act(async () => { setInputFiles(input(), [pdf()]); });
    await harness.flush();
    await waitUntil(() => {
      expect(cells()).toHaveLength(5);
      expect(downloadElement()).not.toBeNull();
    });
  }

  const find = <T extends Element = HTMLElement>(selector: string): T => {
    const found = root().querySelector<T>(selector);
    if (!found) throw new Error(`nothing matches ${selector}`);
    return found;
  };
  const cells = () => Array.from(root().querySelectorAll<HTMLElement>('ul[data-page-grid] > li[data-key]'));
  const button = (label: string) => {
    const found = Array.from(root().querySelectorAll('button')).find((b) => b.textContent === label);
    if (!found) throw new Error(`no button ${label}`);
    return found;
  };
  const heading = () => find('#page-grid-heading');
  const rangeField = () => find<HTMLInputElement>('#page-selector-input');
  // Split and PDF to Image show the page range; Edit Pages has no range field, and says so by it being absent.
  const expectRange = (shown: string) => expect(root().querySelector<HTMLInputElement>('#page-selector-input')?.value ?? null).toBe(hasField ? shown : null);
  const downloadElement = () => root().querySelector<HTMLElement>('a[data-state]');
  const download = () => {
    const found = downloadElement();
    if (!found) throw new Error('no Download element');
    return found;
  };
  const skipButton = (n: number) => {
    const found = cells()[n - 1].querySelector('[aria-label^="Skip page"], [aria-label^="Include page"]');
    if (!found) throw new Error(`no skip button on page ${n}`);
    return found;
  };
  const isSkipped = (n: number) => skipButton(n).getAttribute('aria-label')!.startsWith('Include');
  const skipped = () => [1, 2, 3, 4, 5].map(isSkipped);
  const undoButton = () => find<HTMLButtonElement>('[aria-label="Undo last change"]');
  const click = async (el: Element) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await harness.flush();
  };
  const undo = () => click(undoButton());
  const type = async (value: string) => {
    await act(async () => {
      rangeField().value = value;
      rangeField().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await harness.flush();
  };

  it('loads a PDF handed off from the home page as if picked', async () => {
    await saveHandoff(handoff, { fileName: 'handed.pdf', fileType: 'application/pdf', fileBytes: new Uint8Array(FIVE_PAGES).buffer });
    mount();
    await waitUntil(() => expect(cells()).toHaveLength(5));
    // The hand-off was collected: nothing is left parked for the next visit.
    expect(await harness.takeHandoff(handoff)).toBeNull();
    expect(heading().textContent).toContain(handed);
  });

  it('skips and includes pages: bulk buttons, one step each, a skipped tile, a typed range and an out-of-range error', async () => {
    await open();
    // Include all, Skip all and Invert are one step each, and none when nothing changes.
    await click(button('Include all'));
    expect(undoButton().disabled).toBe(true);
    await click(button('Skip all'));
    expect(skipped()).toEqual([true, true, true, true, true]);
    expect(download().getAttribute('data-state')).toBe('nothing');
    expect(download().textContent).toContain('Every page is skipped');
    expectRange('');
    await click(button('Include all'));
    expect(skipped()).toEqual([false, false, false, false, false]);
    await click(skipButton(1));
    await click(button('Invert'));
    expect(skipped()).toEqual([false, true, true, true, true]);
    expectRange('1');
    await undo();
    expect(skipped()).toEqual([true, false, false, false, false]);
    await undo();
    await undo();
    expect(skipped()).toEqual([true, true, true, true, true]);
    await undo();
    expect(skipped()).toEqual([false, false, false, false, false]);
    expect(undoButton().disabled).toBe(true);

    // A skipped tile stays in place and the heading counts it, and including it again takes the count back.
    await click(skipButton(2));
    expect(cells().map((c) => c.dataset.key)).toEqual(['0:0', '0:1', '0:2', '0:3', '0:4']);
    expect(isSkipped(2)).toBe(true);
    expect(cells()[1].hasAttribute('data-skipped')).toBe(true);
    expect(heading().textContent).toContain(`4 ${noun}`);
    expect(heading().textContent).toContain('1 page skipped');
    expectRange('1, 3-5');
    await click(skipButton(2));
    expect(isSkipped(2)).toBe(false);
    expect(heading().textContent).not.toContain('skipped');
    expectRange('1-5');

    if (!hasField) return;
    // Typing a range skips the other pages, as one Undo step.
    await type('2-3');
    expect(skipped()).toEqual([true, false, false, true, true]);
    expect(heading().textContent).toContain(`2 ${noun}`);
    await undo();
    expect(skipped()).toEqual([false, false, false, false, false]);
    expect(rangeField().value).toBe('1-5');

    // An out-of-range page keeps the selection and shows the error.
    await click(skipButton(1));
    await type('99');
    expect(root().querySelector('[role="alert"]')!.textContent).toContain('99');
    expect(isSkipped(1)).toBe(true);
    expect(isSkipped(2)).toBe(false);
    await type('1-');
    expect(root().querySelector('[role="alert"]')).toBeNull();
  });
});

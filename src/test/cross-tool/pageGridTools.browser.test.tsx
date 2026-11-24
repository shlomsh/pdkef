import { render, type VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfSplitTool from '../../tools/split/PdfSplitTool.tsx';
import PdfToImageTool from '../../tools/to-image/PdfToImageTool.tsx';
import PdfEditPagesTool from '../../tools/edit-pages/PdfEditPagesTool.tsx';
import { saveHandoff } from '#lib/drafts/draftStore.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../harness/browserToolHarness.ts';
import { answerNetwork } from '../support/network.browser.ts';
import { setInputFiles } from '../support/setInputFiles.js';
import { until } from '../support/until.js';

// What Split, PDF to Image and Edit Pages share by construction (the page workspace, the bulk row, the Replace line,
// the file intake): each tool wires it, so each tool runs the same cases. What differs per tool stays in its own test.

answerNetwork();

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
  bytes: () => Uint8Array;
}

const TOOLS: PageGridTool[] = [
  { name: 'Split', element: () => <PdfSplitTool quietPolicy={FAST_QUIET} />, handoff: 'split', noun: 'pages', handed: 'extracted_handed.pdf', field: true, bytes: () => FIVE_PAGES },
  {
    name: 'PDF to Image', element: () => <PdfToImageTool quietPolicy={FAST_QUIET} />, handoff: 'pdf-to-image', noun: 'images', handed: 'handed-page-N.png', field: true,
    bytes: () => FIVE_PAGES,
  },
  { name: 'Edit Pages', element: () => <PdfEditPagesTool />, handoff: 'edit-pdf', noun: 'pages', handed: 'handed_modified.pdf', field: false, bytes: () => FIVE_PAGES },
];

describe.each(TOOLS)('$name on the shared page workspace', ({ element, handoff, noun, handed, field: hasField, bytes }) => {
  let container: HTMLElement | null = null;
  let harness: BrowserToolHarness;

  beforeEach(async () => {
    harness = await installBrowserToolHarness();
  });

  afterEach(async () => {
    const host = container;
    if (host) {
      act(() => render(null, host));
      host.remove();
      container = null;
    }
    vi.restoreAllMocks();
    await harness.restore();
  });

  function mount() {
    const host = document.createElement('div');
    container = host;
    document.body.appendChild(host);
    act(() => render(element(), host));
  }
  const root = () => container!;
  const input = () => root().querySelector('input[type="file"]');
  const pdf = (name = 'report.pdf') => new File([new Uint8Array(bytes())], name, { type: 'application/pdf' });
  async function open() {
    mount();
    await act(async () => { setInputFiles(input(), [pdf()]); });
    await harness.flush();
    await until(() => cells().length === 5 && downloadElement());
  }

  // The element, or a loud failure naming the selector: the cases below read what a person would see.
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

  it('offers Replace file once, as the shared quiet last line, and it asks first, naming the file and what stays in recents', async () => {
    await open();
    const replaces = Array.from(root().querySelectorAll('button')).filter((b) => b.textContent!.trim().startsWith('Replace'));
    expect(replaces).toHaveLength(1);
    expect(replaces[0].closest('[data-replace-line]')).not.toBeNull();
    await click(button('Replace file'));
    const confirmation = find<HTMLDialogElement>('dialog[aria-labelledby="confirm-replace-title"]');
    expect(confirmation.open).toBe(true);
    expect(confirmation.textContent).toContain('stays in your recent files');
    expect(confirmation.textContent).toContain('report.pdf');
  });

  it('loads a PDF handed off from the home page as if picked', async () => {
    await saveHandoff(handoff, { fileName: 'handed.pdf', fileType: 'application/pdf', fileBytes: new Uint8Array(bytes()).buffer });
    mount();
    await until(() => cells().length === 5);
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
    if (hasField) expect(rangeField().value).toBe('');
    await click(button('Include all'));
    expect(skipped()).toEqual([false, false, false, false, false]);
    await click(skipButton(1));
    await click(button('Invert'));
    expect(skipped()).toEqual([false, true, true, true, true]);
    if (hasField) expect(rangeField().value).toBe('1');
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
    if (hasField) expect(rangeField().value).toBe('1, 3-5');
    await click(skipButton(2));
    expect(isSkipped(2)).toBe(false);
    expect(heading().textContent).not.toContain('skipped');
    if (hasField) expect(rangeField().value).toBe('1-5');

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

// @ts-nocheck - test-only, mirrors the island tests' untyped style
import fs from 'fs';
import path from 'path';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfSplitTool from '../../tools/split/PdfSplitTool.tsx';
import PdfToImageTool from '../../tools/to-image/PdfToImageTool.tsx';
import PdfEditPagesTool from '../../tools/edit-pages/PdfEditPagesTool.tsx';
import { saveHandoff } from '#lib/drafts/draftStore.ts';
import { parsePageSelector } from '#lib/pages/pageSelector.js';
import { installToolHarness } from '../harness/toolHarness.ts';
import { pdfjsEdges } from '../harness/pdfjsEdges.ts';
import { setInputFiles } from '../support/setInputFiles.js';
import { until } from '../support/until.js';

// What Split, PDF to Image and Edit Pages share by construction (the page workspace, the bulk row, the Replace line,
// the file intake): each tool wires it, so each tool runs the same cases. What differs per tool stays in its own test.

// EDGE: the conversion paints every page through pdf.js onto a canvas, neither of which jsdom has.
vi.mock('../../tools/to-image/lib/toImage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  convertPdfToImages: async (file, opts) => parsePageSelector(opts.pages, pdfjsEdges.source.pageCount).map((n) => ({
    pageNumber: n,
    blob: new Blob(['x'], { type: opts.format }),
    filename: `report-page-${n}.png`,
  })),
}));

const FAST_QUIET = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const FIVE_PAGES = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/num-5.pdf'));
const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const txt = (name) => new File(['x'], name, { type: 'text/plain' });

// `field`: the tool has the page-range field. `noun`: what its heading counts. Five pages each.
const TOOLS = [
  { name: 'Split', Tool: PdfSplitTool, props: { quietPolicy: FAST_QUIET }, handoff: 'split', noun: 'pages', handed: 'extracted_handed.pdf', field: true, bytes: () => FIVE_PAGES },
  {
    name: 'PDF to Image', Tool: PdfToImageTool, props: { quietPolicy: FAST_QUIET }, handoff: 'pdf-to-image', noun: 'images', handed: 'handed-page-N.png', field: true,
    // pdf.js is faked, so the bytes only need to look like a PDF; the fake source reports the page count.
    bytes: () => new TextEncoder().encode('%PDF-1.4'),
    prepare: () => { pdfjsEdges.source.pageCount = 5; },
  },
  { name: 'Edit Pages', Tool: PdfEditPagesTool, props: {}, handoff: 'edit-pdf', noun: 'pages', handed: 'handed_modified.pdf', field: false, bytes: () => FIVE_PAGES },
];

describe.each(TOOLS)('$name on the shared page workspace', ({ Tool, props, handoff, noun, handed, field: hasField, bytes, prepare }) => {
  let container;
  let harness;

  beforeEach(() => {
    harness = installToolHarness();
    prepare?.();
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
  });

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    harness.restore();
  });

  function mount() {
    container = document.createElement('div');
    document.body.appendChild(container);
    // jsdom cannot follow a download link.
    container.addEventListener('click', (e) => { if (e.target.closest?.('a[download]')) e.preventDefault(); });
    act(() => render(<Tool {...props} />, container));
  }
  const input = () => container.querySelector('input[type="file"]');
  const pdf = (name = 'report.pdf') => new File([bytes()], name, { type: 'application/pdf' });
  async function open() {
    mount();
    await act(async () => { setInputFiles(input(), [pdf()]); });
    await wait(50);
    await harness.flush();
    await until(() => cells().length === 5 && downloadElement());
  }

  const cells = () => Array.from(container.querySelectorAll('ul[data-page-grid] > li[data-key]'));
  const button = (label) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label);
  const heading = () => container.querySelector('#page-grid-heading');
  const rangeField = () => container.querySelector('#page-selector-input');
  const downloadElement = () => container.querySelector('a[data-state]');
  const skipButton = (n) => cells()[n - 1].querySelector('[aria-label^="Skip page"], [aria-label^="Include page"]');
  const isSkipped = (n) => skipButton(n).getAttribute('aria-label').startsWith('Include');
  const skipped = () => [1, 2, 3, 4, 5].map(isSkipped);
  const undoButton = () => container.querySelector('[aria-label="Undo last change"]');
  const click = async (el) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await harness.flush();
  };
  const undo = () => click(undoButton());
  const type = async (value) => {
    await act(async () => {
      rangeField().value = value;
      rangeField().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await harness.flush();
  };

  it('renders the initial dropzone', () => {
    mount();
    const dropzone = container.querySelector('[data-dropzone]');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Drop PDF here');
  });

  it('lists the files it skipped, one by name and several by count', async () => {
    mount();
    const note = () => container.querySelector('[role="status"]')?.textContent;
    await act(async () => { setInputFiles(input(), [txt('2025-notes.txt')]); });
    expect(note()).toBe('Skipped “2025-notes.txt” - not a PDF.');
    await act(async () => { setInputFiles(input(), [txt('a.txt'), txt('b.txt')]); });
    expect(note()).toBe('Skipped 2 files - not PDFs.');
  });

  it('offers Replace file once, as the shared quiet last line, at every width', async () => {
    await open();
    const replaces = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent.trim().startsWith('Replace'));
    expect(replaces).toHaveLength(1);
    expect(replaces[0].closest('[data-replace-line]')).not.toBeNull();
  });

  it('Replace file asks first and names the file and what stays in recents', async () => {
    await open();
    await click(button('Replace file'));
    const confirmation = container.querySelector('dialog[aria-labelledby="confirm-replace-title"]');
    expect(confirmation.open).toBe(true);
    expect(confirmation.textContent).toContain('stays in your recent files');
    expect(confirmation.textContent).toContain('report.pdf');
  });

  it('loads a PDF handed off from the home page as if picked', async () => {
    await saveHandoff(handoff, { fileName: 'handed.pdf', fileType: 'application/pdf', fileBytes: bytes().buffer.slice(bytes().byteOffset, bytes().byteOffset + bytes().byteLength) });
    mount();
    await until(() => cells().length === 5);
    // The hand-off was collected: nothing is left parked for the next visit.
    expect(await harness.takeHandoff(handoff)).toBeNull();
    expect(heading().textContent).toContain(handed);
  });

  it('a skipped tile stays in place and the heading counts it, and including it again takes the count back', async () => {
    await open();
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
  });

  it('Include all, Skip all and Invert are one step each, and none when nothing changes', async () => {
    await open();
    await click(button('Include all'));
    expect(undoButton().disabled).toBe(true);
    await click(button('Skip all'));
    expect(skipped()).toEqual([true, true, true, true, true]);
    expect(downloadElement().getAttribute('data-state')).toBe('nothing');
    expect(downloadElement().textContent).toContain('Every page is skipped');
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
  });

  it.runIf(hasField)('typing a range skips the other pages, as one Undo step', async () => {
    await open();
    await type('2-3');
    expect(skipped()).toEqual([true, false, false, true, true]);
    expect(heading().textContent).toContain(`2 ${noun}`);
    await undo();
    expect(skipped()).toEqual([false, false, false, false, false]);
    expect(rangeField().value).toBe('1-5');
  });

  it.runIf(hasField)('keeps the selection and shows the error for an out-of-range page', async () => {
    await open();
    await click(skipButton(1));
    await type('99');
    expect(container.querySelector('[role="alert"]').textContent).toContain('99');
    expect(isSkipped(1)).toBe(true);
    expect(isSkipped(2)).toBe(false);
    await type('1-');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

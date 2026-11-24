import { render, type VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfSplitTool from '../../tools/split/PdfSplitTool.tsx';
import PdfToImageTool from '../../tools/to-image/PdfToImageTool.tsx';
import PdfEditPagesTool from '../../tools/edit-pages/PdfEditPagesTool.tsx';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import type { QuietPolicy } from '#lib/output/quietPrepare.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../harness/browserToolHarness.ts';
import { answerNetwork } from '../support/network.browser.ts';
import { setInputFiles } from '../support/setInputFiles.js';
import { until } from '../support/until.js';

// What Split, PDF to Image and Edit Pages share by construction (the Replace line): each tool wires it, so each tool runs the same cases. What differs per tool stays in its own test.

answerNetwork();

const FAST_QUIET: QuietPolicy = { baseMs: 5, stepMs: 0, maxMs: 5, burstWindowMs: 1 };
const FIVE_PAGES: Uint8Array = await (async () => {
  const { PDFDocument } = await getPdfLib();
  const doc = await PDFDocument.create();
  for (const width of [200, 210, 220, 230, 240]) doc.addPage([width, 300]);
  return doc.save();
})();

interface PageGridTool {
  name: string;
  element: () => VNode;
  bytes: () => Uint8Array;
}

const TOOLS: PageGridTool[] = [
  { name: 'Split', element: () => <PdfSplitTool quietPolicy={FAST_QUIET} />, bytes: () => FIVE_PAGES },
  {
    name: 'PDF to Image', element: () => <PdfToImageTool quietPolicy={FAST_QUIET} />, bytes: () => FIVE_PAGES,
  },
  { name: 'Edit Pages', element: () => <PdfEditPagesTool />, bytes: () => FIVE_PAGES },
];

describe.each(TOOLS)('$name on the shared page workspace', ({ element, bytes }) => {
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
  const downloadElement = () => root().querySelector<HTMLElement>('a[data-state]');
  const click = async (el: Element) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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
});

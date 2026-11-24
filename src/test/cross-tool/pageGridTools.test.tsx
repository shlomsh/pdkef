import { render, type VNode } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PdfSplitTool from '../../tools/split/PdfSplitTool.tsx';
import PdfToImageTool from '../../tools/to-image/PdfToImageTool.tsx';
import PdfEditPagesTool from '../../tools/edit-pages/PdfEditPagesTool.tsx';
import { installToolHarness, type ToolHarness } from '../harness/toolHarness.ts';
import { setInputFiles } from '../support/setInputFiles.js';

// What Split, PDF to Image and Edit Pages share by construction (the dropzone and the file intake): each tool
// wires it, so each tool runs the same cases. The cases that need a PDF opened are in pageGridTools.browser.test.tsx.

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

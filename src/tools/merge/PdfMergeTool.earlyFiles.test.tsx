import { hydrate, render } from 'preact';
import { act } from 'preact/test-utils';
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import PdfMergeTool from './PdfMergeTool.tsx';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { installToolHarness, type ToolHarness } from '../../test/harness/toolHarness.ts';

const FIXTURE = new TextEncoder().encode('%PDF-1.4\n%%EOF');
const pdf = (name: string) => new File([FIXTURE], name, { type: 'application/pdf' });

/* Files offered the moment the island hydrates, before the lazy draft module and
   the grid have loaded, land as entries. (A change event fired BEFORE hydration has
   no handler to hear it, in 959e940f's island exactly as now: that is a timing
   race for a caller to wait out, like the astro-island wait in the e2e specs.) */
describe('files offered right after hydration', () => {
  const Island = PdfMergeTool;
  let container: HTMLElement | null = null;
  let harness: ToolHarness;
  beforeEach(() => { harness = installToolHarness(); });
  afterEach(async () => {
    // Unmount, then let the hand-off intake's IndexedDB read settle while the DOM still exists:
    // a read that outlives the test file touches `document` after jsdom is gone (CI, 2026-10-27).
    // IndexedDB answers in order, so once a read of our own returns, the intake's earlier one has.
    if (container) act(() => render(null, container!));
    await harness.takeHandoff('merge');
    container?.remove();
    container = null;
    harness.restore();
  });

  it('lands them as entries when offered straight after hydration starts', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(<Island />);
    await act(async () => { hydrate(<Island />, container!); });
    // No flush: the draft module and the grid have not loaded yet.
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      setInputFiles(input, [pdf('one.pdf'), pdf('two.pdf'), pdf('three.pdf')]);
    });
    await waitUntil(() => expect(container!.querySelectorAll('[data-link-row]').length).toBe(3));
  });
});

import { hydrate, render } from 'preact';
import { act } from 'preact/test-utils';
import { renderToString } from 'preact-render-to-string';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import PdfMergeTool from './PdfMergeTool.tsx';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import num2Url from '../../lib/__fixtures__/num-2.pdf?url';

answerNetwork();

const FIXTURE = new Uint8Array(await (await fetch(num2Url)).arrayBuffer());
const pdf = (name: string) => new File([FIXTURE], name, { type: 'application/pdf' });

/* Files offered the moment the island hydrates, before the lazy draft module and
   the grid have loaded, land as entries. (A change event fired BEFORE hydration has
   no handler to hear it, in 959e940f's island exactly as now: that is a timing
   race for a caller to wait out, like the astro-island wait in the e2e specs.) */
describe('files offered right after hydration', () => {
  const Island = PdfMergeTool;
  let container: HTMLElement | null = null;
  let harness: BrowserToolHarness;
  beforeEach(async () => { harness = await installBrowserToolHarness(); });
  afterEach(async () => {
    // Unmount, then let the hand-off intake's IndexedDB read settle while the DOM still exists.
    // IndexedDB answers in order, so once a read of our own returns, the intake's earlier one has.
    if (container) act(() => render(null, container!));
    await harness.takeHandoff('merge');
    container?.remove();
    container = null;
    await harness.restore();
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

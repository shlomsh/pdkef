import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPipeline } from '../lib/loadPipeline.ts';
import { turnImage } from '../lib/scanPipeline.ts';
import { newPage } from '../lib/scanPages.ts';
import { ScanWork, type ScanPage } from '../state/scanWork.ts';
import { initialScanState } from '../state/scanState.ts';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { installBrowserToolHarness, type BrowserToolHarness } from '../../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../../test/support/network.browser.ts';
import { useScanView } from './useScanView.ts';

answerNetwork();
vi.mock('../lib/scanPipeline.ts', { spy: true });

let container: HTMLElement | null = null;
let harness: BrowserToolHarness;
beforeEach(async () => {
  harness = await installBrowserToolHarness();
  vi.mocked(turnImage).mockClear();
});
afterEach(async () => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  await harness.restore();
});

async function mount(page: ScanPage) {
  const work = new ScanWork();
  work.pages = [page];
  work.previewBlobs.set(page.id, new Blob(['x']));
  let map: Record<string, string> = {};
  const setTurnedPreviews = (update: Record<string, string> | ((m: Record<string, string>) => Record<string, string>)) => { map = typeof update === 'function' ? update(map) : update; };
  function Host() {
    useScanView({
      state: { ...initialScanState, phase: 'corners', selectedId: page.id }, dispatch: vi.fn(), work, hasPages: true, selected: page,
      editorRef: { current: null }, headingRef: { current: null }, listRef: { current: null }, unmountedRef: { current: false },
      turnedPreviews: {}, setTurnedPreviews,
    });
    return null;
  }
  container = document.createElement('div');
  await act(async () => { render(<Host />, container!); });
  await loadPipeline();
  const turning = vi.mocked(turnImage).mock.results[0].value;
  await expect(turning).rejects.toBeInstanceOf(Error);
  await act(async () => { await drainPromises(); });
  return () => map;
}

describe('useScanView turned preview', () => {
  it('falls back to the unturned preview when turning fails, so the corners are never blank', async () => {
    const page = { ...newPage(new File(['x'], 'a.jpg'), 'document'), turns: 1, guessed: true, preview: 'blob:p' };
    const turned = await mount(page);
    await harness.flush();
    expect(harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'scan_turn_preview', type: 'DOMException' }]);
    expect(turned()[`${page.id}|1`]).toBe('blob:p');
  });
});

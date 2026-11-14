import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { newPage } from '../lib/scanPages.ts';
import { ScanWork, type ScanPage } from '../state/scanWork.ts';
import { initialScanState } from '../state/scanState.ts';
import { useScanView } from './useScanView.ts';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
const turnImage = vi.fn();
vi.mock('../lib/loadPipeline.ts', () => ({ loadPipeline: () => Promise.resolve({ turnImage }) }));

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

async function mount(page: ScanPage) {
  const work = new ScanWork();
  work.pages = [page];
  work.previewBlobs.set(page.id, new Blob(['x']));
  let map: Record<string, string> = {};
  const setTurnedPreviews = vi.fn((update) => { map = typeof update === 'function' ? update(map) : update; });
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
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return () => map;
}

describe('useScanView turned preview', () => {
  it('falls back to the unturned preview when turning fails, so the corners are never blank', async () => {
    turnImage.mockRejectedValue(new Error('boom'));
    const page = { ...newPage(new File(['x'], 'a.jpg'), 'document'), turns: 1, guessed: true, preview: 'blob:p' };
    const turned = await mount(page);
    expect(reportError).toHaveBeenCalledWith('pdf_tool_run', expect.any(Error), 'scan_turn_preview');
    expect(turned()[`${page.id}|1`]).toBe('blob:p');
  });
});

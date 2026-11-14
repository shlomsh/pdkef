import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { newPage } from '../lib/scanPages.ts';
import { ScanWork, type ScanPage } from '../state/scanWork.ts';
import { useScanResults } from './useScanResults.ts';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

const readPage = (): ScanPage => ({ ...newPage(new File(['x'], 'a.jpg'), 'document'), guessed: true, preview: 'blob:p' });

/** Mounts the hook for `page`, whose run rejects; `before` shapes the work first. */
async function fail(page: ScanPage, before: (work: ScanWork) => void) {
  const work = new ScanWork();
  work.pages = [page];
  before(work);
  const dispatch = vi.fn();
  const processed = vi.fn().mockRejectedValue(new Error('boom'));
  function Host() {
    useScanResults({ pages: [page], work, processed, unmountedRef: { current: false }, dispatch, results: {}, setResults: vi.fn(), turnedPreviews: {} });
    return null;
  }
  container = document.createElement('div');
  await act(async () => { render(<Host />, container!); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return dispatch;
}

describe('useScanResults failures', () => {
  it('marks a page still there as failed', async () => {
    const page = readPage();
    const dispatch = await fail(page, () => {});
    expect(reportError).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'pageFailed', id: page.id });
  });
  it('does not mark a removed page as failed', async () => {
    const page = readPage();
    const dispatch = await fail(page, (work) => work.removed.add(page.id));
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('does not mark a page held for Undo as failed', async () => {
    const page = readPage();
    const dispatch = await fail(page, (work) => { work.removal = { page, index: 0, failed: false }; });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('useScanResults adoptResult', () => {
  it('makes no result for a page removed while its run was in flight', async () => {
    const page = readPage();
    const work = new ScanWork();
    work.pages = [page];
    const setResults = vi.fn();
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:r');
    let finish!: (value: never) => void;
    const processed = vi.fn(() => new Promise((resolve) => { finish = resolve as never; }));
    function Host() {
      useScanResults({ pages: [page], work, processed: processed as never, unmountedRef: { current: false }, dispatch: vi.fn(), results: {}, setResults, turnedPreviews: {} });
      return null;
    }
    container = document.createElement('div');
    await act(async () => { render(<Host />, container!); });
    work.removed.add(page.id);
    finish({ blob: new Blob(['b']), thumb: new Blob(['t']) } as never);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(work.results[page.id]).toBeUndefined();
    expect(create).not.toHaveBeenCalled();
    expect(setResults).not.toHaveBeenCalled();
    create.mockRestore();
  });
});

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScanPhoneTable from './ScanPhoneTable.tsx';

let container: HTMLElement | null = null;
const pages = [{ id: 1 }, { id: 2 }, { id: 3 }] as never[];
const results = {
  1: { key: 'k1', thumbUrl: 'a.jpg', page: { width: 300, height: 400 } },
  2: { key: 'k2', thumbUrl: 'b.jpg', page: { width: 400, height: 300 } },
} as never;

function makeFlow(over: Record<string, unknown> = {}) {
  return {
    downloadState: 'ready', downloadLinkReady: true, shareReady: true, canSharePdf: true, handoffBusy: false, handoffFailed: false,
    onQuietDownloadTap: vi.fn(), onQuietPreparingTap: vi.fn(), onRowPreparingTap: vi.fn(), onDownloadTap: vi.fn(),
    handleShare: vi.fn(), requestHandoff: vi.fn(),
    ...over,
  };
}

function mount(over: { flow?: Record<string, unknown>; prepared?: Record<string, unknown>; failedIds?: number[]; pageSize?: string; rating?: unknown } = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const handlers = { onOpen: vi.fn(), onTileKeyDown: vi.fn(), onRotate: vi.fn(), onRemove: vi.fn(), onFiles: vi.fn(), onCamera: vi.fn(), onPickMore: vi.fn(), onClear: vi.fn() };
  const out = { onShowFailedPage: vi.fn(), onRename: vi.fn(), onEditingChange: vi.fn() };
  const options = { pageSize: over.pageSize ?? 'fit', limit: 'none', onPageSize: vi.fn(), onLimit: vi.fn(), limitNote: 'Full quality.' };
  const flow = makeFlow(over.flow);
  act(() => render(
    <ScanPhoneTable
      pages={pages}
      results={results}
      resultKeyOf={(p: { id: number }) => `k${p.id}`}
      failedIds={over.failedIds ?? []}
      listRef={() => {}}
      output={{
        prepared: { status: 'ready', url: 'blob:x', size: 1024, progress: 1, prepareNow: vi.fn(), ...over.prepared },
        flow, drive: { available: false, state: 'idle', link: null, save: vi.fn() }, fileName: 'Scan.pdf', detail: '3 pages · 1 KB', outputName: 'Scan', isRenaming: false, ...out,
      } as never}
      options={options as never}
      rating={over.rating ?? <div data-rating />}
      {...handlers}
    />, container!));
  return { container, flow, options, ...handlers, ...out };
}
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ScanPhoneTable', () => {
  it('ends the grid with Add pages, which opens the camera, and offers a quiet Choose photos on the hint row', () => {
    const { container, onCamera, onPickMore } = mount();
    const addCell = container.querySelector('ul')!.lastElementChild!;
    expect(addCell.querySelector('[data-add-pages]')).not.toBeNull();
    act(() => (addCell.querySelector('button') as HTMLElement).click());
    expect(onCamera).toHaveBeenCalled();
    const row = container.querySelector('[data-hint]')!.parentElement!;
    const choose = [...row.querySelectorAll('button')].find((b) => b.textContent?.includes('Choose photos'))!;
    act(() => choose.click());
    expect(onPickMore).toHaveBeenCalled();
  });
});

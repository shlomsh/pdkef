import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScanWorkspace from './ScanWorkspace.tsx';

let container: HTMLElement | null = null;

function mount(drive: Record<string, unknown> = { available: false }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = { requestReplace: vi.fn(), requestClear: vi.fn() };
  const flow = {
    downloadState: 'ready', downloadLinkReady: true, shareReady: true, canSharePdf: true, handoffBusy: false, handoffFailed: false,
    onQuietDownloadTap: vi.fn(), onQuietPreparingTap: vi.fn(), onRowPreparingTap: vi.fn(), onDownloadTap: vi.fn(),
    handleShare: vi.fn(), requestHandoff: vi.fn(),
  };
  act(() => render(
    <ScanWorkspace
      pages={[{ id: 1 }] as never[]}
      results={{ 1: { key: 'k1', thumbUrl: 'a.jpg', page: { width: 300, height: 400 } } } as never}
      resultKeyOf={(p: { id: number }) => `k${p.id}`}
      failedIds={[]}
      bridge={bridge}
      listRef={() => {}}
      output={{
        prepared: { status: 'ready', url: 'blob:x', size: 1024, progress: 1, prepareNow: vi.fn() },
        flow, drive: { state: 'idle', link: null, save: vi.fn(), ...drive }, fileName: 'Scan.pdf', detail: '1 page · 1 KB', outputName: 'Scan', isRenaming: false,
        onShowFailedPage: vi.fn(), onRename: vi.fn(), onEditingChange: vi.fn(),
      } as never}
      options={{ pageSize: 'fit', limit: 'none', onPageSize: vi.fn(), onLimit: vi.fn(), limitNote: 'Full quality.' } as never}
      rating={<div data-rating />}
      onOpen={vi.fn()}
      onFiles={vi.fn()}
      onTileKeyDown={vi.fn()}
      onRotate={vi.fn()}
      onRemove={vi.fn()}
    />, container!));
  return { container, bridge };
}
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ScanWorkspace', () => {
  it('joins the Save to Google Drive arrow to Download only when Drive can take the file', () => {
    expect(mount().container.querySelector('[aria-haspopup="menu"]')).toBeNull();
    act(() => render(null, container!)); container!.remove(); container = null;
    const { container: on } = mount({ available: true });
    const arrow = on.querySelector('[aria-haspopup="menu"]')!;
    expect(arrow).not.toBeNull();
    expect(arrow.previousElementSibling?.getAttribute('download')).toBe('Scan.pdf');
  });

  it('puts Clear all on the name row, out of the rail with Download', () => {
    const { container, bridge } = mount();
    const clear = container.querySelector('[data-clear-all]') as HTMLElement;
    const nameRow = container.querySelector('h2')!.parentElement!.parentElement!;
    expect(nameRow.contains(clear)).toBe(true);
    expect(container.querySelector('[data-rail]')!.textContent).not.toContain('Clear all');
    act(() => clear.click());
    expect(bridge.requestClear).toHaveBeenCalled();
  });
});

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScanTable from './ScanTable.tsx';

let container: HTMLElement | null = null;
const pages = [{ id: 1 }, { id: 2 }, { id: 3 }] as never[];
const results = {
  1: { key: 'k1', thumbUrl: 'a.jpg' },
  2: { key: 'k2', thumbUrl: 'b.jpg' },
} as never;

function makeFlow(over: Record<string, unknown> = {}) {
  return {
    downloadState: 'ready', downloadLinkReady: true, shareReady: true, handoffBusy: false,
    onQuietDownloadTap: vi.fn(), onQuietPreparingTap: vi.fn(), handleShare: vi.fn(), requestHandoff: vi.fn(),
    ...over,
  };
}

function mount(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const handlers = { onOpen: vi.fn(), onFiles: vi.fn(), onPickMore: vi.fn(), onClear: vi.fn(), onLimit: vi.fn(), onPageSize: vi.fn() };
  act(() => render(
    <ScanTable
      pages={pages}
      results={results}
      resultKeyOf={(p: { id: number }) => `k${p.id}`}
      failedIds={[]}
      flow={makeFlow() as never}
      prepared={{ status: 'ready', url: 'blob:x', size: 1024, prepareNow: vi.fn() }}
      fileName="Scan.pdf"
      pageSize="fit"
      limit="none"
      limitNote={undefined}
      fallbackDownload={<div data-fallback-download />}
      {...handlers}
      {...props}
    />, container!));
  return { container, ...handlers };
}
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ScanTable', () => {
  it('lists the pages numbered, then the Add pages tile, then the hint', () => {
    const { container } = mount();
    const tiles = [...container.querySelectorAll('[data-table-page]')];
    expect(tiles).toHaveLength(3);
    expect(tiles.map((t) => t.querySelector('[data-badge]')?.textContent)).toEqual(['1', '2', '3']);
    expect(container.querySelector('[data-add-pages]')?.textContent).toContain('Add pages');
    expect(container.textContent).toContain('Tap a page to fix its corners, turn it or retake it.');
  });

  it('opens a page on tap', () => {
    const { container, onOpen } = mount();
    act(() => (container.querySelectorAll('[data-table-page]')[1] as HTMLElement).click());
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('asks for the picker from the Add pages tile', () => {
    const { container, onPickMore } = mount();
    act(() => (container.querySelector('[data-add-pick]') as HTMLElement).click());
    expect(onPickMore).toHaveBeenCalled();
  });

  it('shows the real size and Share as the one filled button', () => {
    const { container } = mount();
    expect(container.querySelector('[data-size-value]')?.textContent).toMatch(/1(\.0)? KB/);
    const share = container.querySelector('[data-share]') as HTMLElement;
    expect(share.textContent).toContain('Share');
    expect(container.querySelector('[data-fallback-download]')).toBeNull();
  });

  it('shares on tap once the PDF is built', () => {
    const flow = makeFlow();
    const { container } = mount({ flow: flow as never });
    act(() => (container.querySelector('[data-share]') as HTMLElement).click());
    expect(flow.handleShare).toHaveBeenCalled();
  });

  it('does not offer Share before the PDF is built, and shows the preparing state', () => {
    const flow = makeFlow();
    const { container } = mount({ flow: flow as never, prepared: { status: 'pending', url: null, size: 0, prepareNow: vi.fn() } });
    expect(container.querySelector('[data-size-value]')?.textContent).toBe('Updating…');
    const share = container.querySelector('[data-share]') as HTMLElement;
    expect(share.getAttribute('aria-disabled')).toBe('true');
    act(() => share.click());
    expect(flow.handleShare).not.toHaveBeenCalled();
  });

  it('puts Download in the Share place where the browser cannot share files', () => {
    const { container } = mount({ flow: makeFlow({ shareReady: false }) as never });
    expect(container.querySelector('[data-share]')).toBeNull();
    expect(container.querySelector('[data-fallback-download]')).not.toBeNull();
    // The quiet row then has no second Download.
    expect(container.querySelector('[data-quiet-download]')).toBeNull();
  });

  it('keeps a quiet row: Download, Sign, Redact, Page size and Clear all', () => {
    const flow = makeFlow();
    const { container, onClear } = mount({ flow: flow as never });
    expect(container.querySelector('[data-quiet-download]')).not.toBeNull();
    const buttons = [...container.querySelectorAll('[data-quiet-row] button')] as HTMLElement[];
    const labels = buttons.map((b) => b.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['Sign', 'Redact', 'Page size: Fit', 'Clear all']));
    act(() => buttons.find((b) => b.textContent?.trim() === 'Sign')!.click());
    expect(flow.requestHandoff).toHaveBeenCalledWith('sign');
    act(() => buttons.find((b) => b.textContent?.trim() === 'Clear all')!.click());
    expect(onClear).toHaveBeenCalled();
  });

  it('reveals the page size options from the quiet Page size button', () => {
    const { container } = mount();
    expect(container.querySelector('#scan-size-table')).toBeNull();
    const toggle = [...container.querySelectorAll('[data-quiet-row] button')].find((b) => b.textContent?.includes('Page size')) as HTMLElement;
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('#scan-size-table')).not.toBeNull();
  });
});

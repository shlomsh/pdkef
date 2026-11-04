import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScanPhoneTable from './ScanPhoneTable.tsx';

vi.mock('../lib/camera/canUseCamera.ts', () => ({ canUseCamera: () => true }));

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
  const handlers = { onOpen: vi.fn(), onTileKeyDown: vi.fn(), onFiles: vi.fn(), onCamera: vi.fn(), onPickMore: vi.fn(), onClear: vi.fn() };
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
        flow, fileName: 'Scan.pdf', detail: '3 pages · 1 KB', outputName: 'Scan', isRenaming: false, ...out,
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

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('ScanPhoneTable', () => {
  it('renders errors, name and Clear all, grid, hint, card, Share, next steps, rating in that order', () => {
    const { container } = mount({ failedIds: [3] });
    // The Download element stands in for Share while a page holds the PDF back, so order is checked on a healthy table below.
    const healthy = mount();
    const q = (s: string) => healthy.container.querySelector(s)!;
    const seq = ['h2', '[data-clear-all]', 'ul', '[data-hint]', '[data-card]', '[data-share]', '[data-quiet-row]', '[data-rating]'].map(q);
    seq.forEach((el, i) => { if (i > 0) expect(before(seq[i - 1], el)).toBe(true); });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(before(container.querySelector('[role="alert"]')!, container.querySelector('h2')!)).toBe(true);
  });

  it('marks the root ready when the PDF is built', () => {
    expect(mount().container.querySelector('[data-scan-ready]')).not.toBeNull();
    act(() => render(null, container!)); container!.remove(); container = null;
    expect(mount({ prepared: { status: 'pending', url: null, size: 0 } }).container.querySelector('[data-scan-ready]')).toBeNull();
  });

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

  it('holds Size, the four limits, the note and Page size in one card, and Page size opens inside it', () => {
    const { container, options } = mount();
    const card = container.querySelector('[data-card]')!;
    expect(card.querySelector('[data-size-value]')?.textContent).toMatch(/1(\.0)? KB/);
    expect([...card.querySelectorAll('[aria-label="Size limit"] [role="radio"]')].map((r) => r.textContent)).toEqual(['Full', '2 MB', '1 MB', '500 KB']);
    expect(card.textContent).toContain('Full quality.');
    const control = card.querySelector('[data-page-size]') as HTMLElement;
    expect(control.textContent).toContain('Page size: Fit');
    expect(card.querySelector('[aria-label="Page size"][role="radiogroup"]')).toBeNull();
    act(() => control.click());
    expect(control.getAttribute('aria-expanded')).toBe('true');
    const radios = [...card.querySelectorAll('[aria-label="Page size"] [role="radio"]')] as HTMLElement[];
    expect(radios.length).toBeGreaterThan(1);
    act(() => radios[1].click());
    expect(options.onPageSize).toHaveBeenCalled();
  });

  it('shares on tap once built; Share is disabled until then', () => {
    const { container: first, flow } = mount();
    act(() => (first.querySelector('[data-share]') as HTMLElement).click());
    expect(flow.handleShare).toHaveBeenCalledTimes(1);
    act(() => render(null, first)); first.remove(); container = null;
    const pending = mount({ prepared: { status: 'pending', url: null, size: 0 }, flow: { downloadState: 'preparing', shareReady: false, downloadLinkReady: false } });
    const share = pending.container.querySelector('[data-share]') as HTMLElement;
    expect(share.getAttribute('aria-disabled')).toBe('true');
    act(() => share.click());
    expect(pending.flow.handleShare).not.toHaveBeenCalled();
  });

  it('puts Download, Sign, Highlight and Redact under Share and hands off', () => {
    const { container, flow } = mount();
    const row = container.querySelector('[data-quiet-row]')!;
    expect(row.querySelector('[data-quiet-download]')).not.toBeNull();
    const buttons = [...row.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Sign', 'Highlight', 'Redact']);
    expect(row.children).toHaveLength(4);
    act(() => buttons[1].click());
    expect(flow.requestHandoff).toHaveBeenCalledWith('highlight-pdf');
    act(() => buttons[2].click());
    expect(flow.requestHandoff).toHaveBeenCalledWith('redact');
  });

  it('puts the filled Download in Share place where the phone cannot share, with Sign, Highlight and Redact under it', () => {
    const { container } = mount({ flow: { canSharePdf: false, shareReady: false } });
    expect(container.querySelector('[data-share]')).toBeNull();
    expect(container.querySelector('[data-state]')).not.toBeNull();
    const row = container.querySelector('[data-quiet-row]')!;
    expect(row.querySelector('[data-quiet-download]')).toBeNull();
    expect(row.children).toHaveLength(3);
  });

  it('shows the Download element error for a held back PDF, and its tap goes to the failed page', () => {
    const { container, onShowFailedPage } = mount({ failedIds: [3], flow: { downloadState: 'error' }, prepared: { status: 'pending', url: null, size: 0 } });
    expect(container.querySelector('[data-share]')).toBeNull();
    const element = container.querySelector('[data-state="error"]') as HTMLElement;
    expect(element.textContent).toContain('Remove page 3');
    act(() => element.click());
    expect(onShowFailedPage).toHaveBeenCalled();
  });

  it('puts Clear all on the name row, away from everything that moves the scan forward', () => {
    const { container, onClear } = mount();
    const clear = container.querySelector('[data-clear-all]') as HTMLElement;
    expect(clear.parentElement).toBe(container.querySelector('h2')!.parentElement);
    expect(clear.parentElement!.children).toHaveLength(2);
    expect(container.querySelector('[data-quiet-row]')!.contains(clear)).toBe(false);
    act(() => clear.click());
    expect(onClear).toHaveBeenCalled();
  });

  it('does not claim the size is updating while a page holds the PDF back', () => {
    const { container } = mount({ failedIds: [3] });
    expect(container.querySelector('[data-size-value]')!.textContent).toBe('');
  });

  it('draws the tiles on the chosen paper', () => {
    const fit = mount({ pageSize: 'fit' }).container.querySelectorAll('[data-paper]')[1].getAttribute('style');
    act(() => render(null, container!)); container!.remove(); container = null;
    expect(mount({ pageSize: 'a4' }).container.querySelectorAll('[data-paper]')[1].getAttribute('style')).not.toBe(fit);
  });
});

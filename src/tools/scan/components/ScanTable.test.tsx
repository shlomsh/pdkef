import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScanTable from './ScanTable.tsx';

let container: HTMLElement | null = null;
const pages = [{ id: 1 }, { id: 2 }, { id: 3 }] as never[];
const results = {
  1: { key: 'k1', thumbUrl: 'a.jpg', page: { width: 300, height: 400 } },
  2: { key: 'k2', thumbUrl: 'b.jpg', page: { width: 300, height: 400 } },
} as never;

function mount(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const handlers = { onOpen: vi.fn(), onFiles: vi.fn(), onPickMore: vi.fn() };
  act(() => render(
    <ScanTable
      pages={pages}
      results={results}
      resultKeyOf={(p: { id: number }) => `k${p.id}`}
      failedIds={[]}
      pageSize="fit"
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

  it('carries nothing of the phone: no Share, size, quiet row or Clear all', () => {
    const { container } = mount();
    expect(container.querySelector('[data-share], [data-size-value], [data-quiet-row], [data-clear-all]')).toBeNull();
  });
});

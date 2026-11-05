import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScanPageGrid from './ScanPageGrid.tsx';

let container: HTMLElement | null = null;
const pages = [{ id: 1 }, { id: 2 }, { id: 3 }] as never[];
const results = {
  1: { key: 'k1', thumbUrl: 'a.jpg', page: { width: 300, height: 400 } },
  2: { key: 'k2', thumbUrl: 'b.jpg', page: { width: 400, height: 300 } },
} as never;

function mount(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const handlers = { onOpen: vi.fn(), onFiles: vi.fn(), onPickMore: vi.fn(), onTileKeyDown: vi.fn(), onRotate: vi.fn(), onRemove: vi.fn() };
  act(() => render(
    <ScanPageGrid pages={pages} results={results} resultKeyOf={(p: { id: number }) => `k${p.id}`} failedIds={[3]} pageSize="fit" {...handlers} {...props} />,
    container!,
  ));
  return { container, ...handlers };
}
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

const paperOf = (root: HTMLElement, index: number) => root.querySelectorAll('[data-paper]')[index] as HTMLElement;

describe('ScanPageGrid', () => {
  it('renders tiles as li[data-id] holding a focusable button div[data-page], numbered, then the Add tile', () => {
    const { container } = mount();
    const items = [...container.querySelectorAll('li[data-id]')];
    expect(items.map((li) => li.getAttribute('data-id'))).toEqual(['1', '2', '3']);
    const tile = items[0].querySelector('div[data-page]') as HTMLElement;
    expect(tile.getAttribute('role')).toBe('button');
    expect(tile.tabIndex).toBe(0);
    expect(items.map((li) => li.querySelector('[data-badge]')?.textContent)).toEqual(['1', '2', '3']);
    expect(container.querySelector('[data-add-pages]')?.textContent).toContain('Add pages');
    expect(container.querySelector('ul')?.lastElementChild?.querySelector('[data-add-pages]')).not.toBeNull();
  });

  it('opens a page on tap, Enter and Space, and hands other keys to the reorder handler', () => {
    const { container, onOpen, onTileKeyDown } = mount();
    const tile = container.querySelectorAll('[data-page]')[1] as HTMLElement;
    act(() => tile.click());
    act(() => { tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    act(() => { tile.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
    expect(onOpen).toHaveBeenCalledTimes(3);
    act(() => { tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(onTileKeyDown).toHaveBeenCalledWith(expect.any(KeyboardEvent), 2);
  });

  it('says a page failed or is processing when it has no picture', () => {
    const { container } = mount();
    expect(container.querySelectorAll('[data-page]')[2].textContent).toContain('Could not read');
  });

  it('lays each page on its real paper, and Page size changes the tiles', () => {
    const { container: fit } = mount({ pageSize: 'fit' });
    const fitStyle = paperOf(fit, 1).getAttribute('style');
    const fitImage = fit.querySelectorAll('[data-paper-image]')[1].getAttribute('style');
    act(() => render(null, fit)); fit.remove(); container = null;
    const { container: a4 } = mount({ pageSize: 'a4' });
    expect(paperOf(a4, 1).getAttribute('style')).not.toBe(fitStyle);
    expect(a4.querySelectorAll('[data-paper-image]')[1].getAttribute('style')).not.toBe(fitImage);
  });

  it('asks for the picker from the Add tile', () => {
    const { container, onPickMore } = mount();
    act(() => (container.querySelector('[data-add-pick]') as HTMLElement).click());
    expect(onPickMore).toHaveBeenCalled();
  });

  describe('the hover cluster (SCAN-51)', () => {
    const cluster = (root: HTMLElement, index: number) => root.querySelectorAll('li[data-id]')[index].querySelector('button[aria-label^="Rotate"]')!.parentElement as HTMLElement;

    it('sits after the tile, never inside it, with Rotate, Remove and Open named by position', () => {
      const { container } = mount();
      const li = container.querySelectorAll('li[data-id]')[1];
      const tile = li.querySelector('[data-page]')!;
      const actions = cluster(container, 1);
      expect(tile.contains(actions)).toBe(false);
      expect(tile.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect([...actions.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Rotate page 2', 'Remove page 2', 'Open page 2']);
      expect([...actions.querySelectorAll('[data-tip]')].map((b) => b.textContent)).toEqual(['Rotate', 'Remove', 'Open']);
      expect(li.className).toContain('host');
    });

    it('hands the page id to Rotate, Remove and Open, and a click never also opens through the tile', () => {
      const { container, onRotate, onRemove, onOpen } = mount();
      const [rotate, remove, open] = [...cluster(container, 1).querySelectorAll('button')];
      act(() => rotate.click());
      act(() => remove.click());
      expect(onRotate).toHaveBeenCalledWith(2);
      expect(onRemove).toHaveBeenCalledWith(2);
      expect(onOpen).not.toHaveBeenCalled();
      act(() => open.click());
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledWith(2);
    });

    it('the Add tile has no cluster', () => {
      const { container } = mount();
      expect(container.querySelector('li:last-child button[aria-label^="Rotate"]')).toBeNull();
    });
  });

  it('a tile with a question carries a label and its aria-label gains the text', () => {
    const asked = [{ id: 1, question: { spine: { top: 0.5, bottom: 0.5 }, rightToLeft: false } }, { id: 2 }] as never[];
    const { container } = mount({ pages: asked });
    const tiles = container.querySelectorAll('[data-page]');
    expect(tiles[0].querySelector('[data-split-ask]')?.textContent).toBe('One page or two?');
    expect(tiles[0].getAttribute('aria-label')).toContain('One page or two?');
    expect(tiles[1].querySelector('[data-split-ask]')).toBeNull();
    expect(tiles[1].getAttribute('aria-label')).not.toContain('One page or two?');
  });
});

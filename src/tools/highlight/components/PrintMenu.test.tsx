import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishHighlightMessages as t } from '../messages.ts';
import PrintMenu from './PrintMenu.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(over: Partial<Parameters<typeof PrintMenu>[0]> = {}) {
  const props = { open: true, withComments: false, onChoose: vi.fn(), onClose: vi.fn(), ...over };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<PrintMenu {...props}><button type="button" data-trigger>Print</button></PrintMenu>, container!));
  const items = () => [...container!.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
  return { props, items };
}

describe('PrintMenu', () => {
  it('shows only its trigger while closed', () => {
    mount({ open: false });
    expect(container!.querySelector('[role="menu"]')).toBeNull();
    expect(container!.querySelector('[data-trigger]')).not.toBeNull();
  });

  it('offers Print alone when the document has no comments', () => {
    const { items } = mount();
    expect(items().map((i) => i.textContent)).toEqual([t.printPlain]);
  });

  it('offers Print with my notes too once the document has a comment', () => {
    const { items } = mount({ withComments: true });
    expect(items().map((i) => i.textContent)).toEqual([t.printPlain, t.printWithNotes]);
  });

  it('choosing an item closes the menu and says whether the notes go too', () => {
    const { props, items } = mount({ withComments: true });
    act(() => { items()[1].click(); });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChoose).toHaveBeenCalledWith(true);
    act(() => { items()[0].click(); });
    expect(props.onChoose).toHaveBeenLastCalledWith(false);
  });

  it('puts focus on the first item when it opens', () => {
    const { items } = mount({ withComments: true });
    expect(document.activeElement).toBe(items()[0]);
  });

  it('the arrow keys walk the items', () => {
    const { items } = mount({ withComments: true });
    act(() => { items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(items()[1]);
    act(() => { items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(items()[0]);
  });

  it('Escape closes it and nothing above hears the key', () => {
    const { props, items } = mount();
    const above = vi.fn();
    document.addEventListener('keydown', above);
    act(() => { items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    document.removeEventListener('keydown', above);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(above).not.toHaveBeenCalled();
  });

  it('a press outside closes it, a press inside does not', () => {
    const { props, items } = mount();
    act(() => { items()[0].dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(props.onClose).not.toHaveBeenCalled();
    act(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('a press on its own trigger is not an outside press', () => {
    const { props } = mount();
    act(() => { container!.querySelector('[data-trigger]')!.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('places itself at the anchor top and the start-aligned left when floating, and sets none otherwise', () => {
    vi.stubGlobal('innerWidth', 1280);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(192);
    mount({ placement: 'floating', anchor: { top: 108, left: 300, right: 340 } });
    const wrap = container!.firstElementChild as HTMLElement;
    expect(wrap.style.top).toBe('108px');
    expect(wrap.style.left).toBe('300px');
    act(() => render(null, container!));
    mount({ placement: 'floating' });
    expect((container!.firstElementChild as HTMLElement).style.top).toBe('');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

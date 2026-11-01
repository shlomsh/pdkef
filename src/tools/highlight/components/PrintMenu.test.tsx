import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishHighlightMessages as t } from '../messages.ts';
import PrintMenu, { PrintDropdown } from './PrintMenu.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(over: Partial<Parameters<typeof PrintMenu>[0]> = {}) {
  const props = { open: true, anchor: { top: 108, left: 300, right: 340 }, onChoose: vi.fn(), onClose: vi.fn(), ...over };
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<PrintMenu {...props} />, container!));
  const items = () => [...container!.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
  return { props, items };
}

describe('PrintMenu', () => {
  it('shows nothing while closed', () => {
    mount({ open: false });
    expect(container!.querySelector('[role="menu"]')).toBeNull();
  });

  it('offers Print and the two note layouts, each with an icon', () => {
    const { items } = mount();
    expect(items().map((i) => i.textContent)).toEqual([t.printPlain, t.printWithNotes, t.printNotesAtEnd]);
    expect(items().every((i) => i.querySelector('svg'))).toBe(true);
  });

  it('choosing an item closes the menu and says which notes go with it', () => {
    const { props, items } = mount();
    act(() => { items()[1].click(); });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onChoose).toHaveBeenCalledWith('beside');
    act(() => { items()[2].click(); });
    expect(props.onChoose).toHaveBeenLastCalledWith('end');
    act(() => { items()[0].click(); });
    expect(props.onChoose).toHaveBeenLastCalledWith('none');
  });

  it('puts focus on the first item when it opens', () => {
    const { items } = mount();
    expect(document.activeElement).toBe(items()[0]);
  });

  it('the arrow keys walk the items', () => {
    const { items } = mount();
    act(() => { items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(document.activeElement).toBe(items()[1]);
    act(() => { items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    act(() => { items()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
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

  it('places itself at the anchor top and the start-aligned left when floating, and sets none otherwise', () => {
    vi.stubGlobal('innerWidth', 1280);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(192);
    mount();
    const wrap = container!.firstElementChild as HTMLElement;
    expect(wrap.style.top).toBe('108px');
    expect(wrap.style.left).toBe('300px');
    act(() => render(null, container!));
    mount({ anchor: undefined });
    expect((container!.firstElementChild as HTMLElement).style.top).toBe('');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('PrintDropdown hover', () => {
  function hoverMount(over: { fine?: boolean }) {
    vi.useFakeTimers();
    window.matchMedia = ((q: string) => ({ matches: !(over.fine ?? true), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const onOpenChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<PrintDropdown open={false} onOpenChange={onOpenChange} withComments onChoose={vi.fn()} />, container!));
    return { wrap: container.firstElementChild as HTMLElement, onOpenChange };
  }
  afterEach(() => { vi.useRealTimers(); });

  it('opens on mouseenter, closes 180 ms after leaving, and re-entering cancels', () => {
    const { wrap, onOpenChange } = hoverMount({});
    act(() => { wrap.dispatchEvent(new Event('mouseenter')); });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    act(() => { wrap.dispatchEvent(new Event('mouseleave')); vi.advanceTimersByTime(100); wrap.dispatchEvent(new Event('mouseenter')); vi.advanceTimersByTime(300); });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    act(() => { wrap.dispatchEvent(new Event('mouseleave')); vi.advanceTimersByTime(200); });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('does nothing on hover with a coarse pointer', () => {
    const { wrap, onOpenChange } = hoverMount({ fine: false });
    act(() => { wrap.dispatchEvent(new Event('mouseenter')); });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  function stateful(fine: boolean) {
    window.matchMedia = ((q: string) => ({ matches: !fine, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    vi.useFakeTimers();
    const calls: boolean[] = [];
    function Harness() {
      const [open, setOpen] = useState(false);
      return <PrintDropdown open={open} onOpenChange={(o) => { calls.push(o); setOpen(o); }} withComments onChoose={vi.fn()} />;
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<Harness />, container!));
    const wrap = container.firstElementChild as HTMLElement;
    const trigger = () => container!.querySelector('button[aria-haspopup="menu"]') as HTMLElement;
    const menu = () => document.querySelector('[role="menu"]');
    return { wrap, trigger, menu, calls };
  }

  it('on a fine pointer a click on the trigger keeps the hover-opened menu open', () => {
    const { wrap, trigger, menu } = stateful(true);
    act(() => { wrap.dispatchEvent(new Event('mouseenter')); });
    expect(menu()).not.toBeNull();
    act(() => { trigger().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); vi.advanceTimersByTime(10); });
    expect(menu()).not.toBeNull();
  });

  it('on a fine pointer, keyboard activation of the trigger opens then closes the menu', () => {
    const { trigger, menu } = stateful(true);
    act(() => { trigger().click(); vi.advanceTimersByTime(10); });
    expect(menu()).not.toBeNull();
    act(() => { trigger().click(); vi.advanceTimersByTime(10); });
    expect(menu()).toBeNull();
  });

  it('Escape still closes it on a fine pointer', () => {
    const { wrap, menu } = stateful(true);
    act(() => { wrap.dispatchEvent(new Event('mouseenter')); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(menu()).toBeNull();
  });

  it('on a coarse pointer a tap toggles', () => {
    const { trigger, menu } = stateful(false);
    act(() => { trigger().click(); vi.advanceTimersByTime(10); });
    expect(menu()).not.toBeNull();
    act(() => { trigger().click(); vi.advanceTimersByTime(10); });
    expect(menu()).toBeNull();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import ReadingCapsule, { type ReadingCapsuleProps } from './ReadingCapsule.tsx';
import { foldedItems, moreDisplay, FOLD_BELOW_PX } from './capsuleItems.ts';

function bus<A extends unknown[]>() {
  const fns = new Set<(...a: A) => void>();
  return { subscribe: (fn: (...a: A) => void) => (fns.add(fn), () => fns.delete(fn)), emit: (...a: A) => fns.forEach((f) => f(...a)) };
}

function setup(over: Partial<ReadingCapsuleProps> = {}, width = 1024) {
  (window as { innerWidth: number }).innerWidth = width;
  const scroll = bus<[number]>();
  const press = bus<[]>();
  const props: ReadingCapsuleProps = {
    fileName: 'lease.pdf', page: 3, pageCount: 12, onJumpToPage: vi.fn(),
    zoomSlot: () => <button type="button" aria-label="Zoom">100%</button>,
    markerSlot: () => <button type="button" aria-label="Marker">M</button>,
    onUndo: vi.fn(), onRedo: vi.fn(), canUndo: true, canRedo: true,
    onPrint: vi.fn(), onDownload: vi.fn(), moreItems: [{ label: 'Feedback', onSelect: vi.fn() }],
    onExit: vi.fn(), scrollEvents: scroll, pagePressEvents: press, ...over,
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<ReadingCapsule {...props} />, host!));
  return { props, scroll, press, bar: q('[role="toolbar"][aria-label="Reading lamp"]')! };
}

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = null;
});

const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const byLabel = (label: string) => q(`[aria-label="${label}"]`)!;
const byText = (text: string) => [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === text)!;
const fire = (el: Element, type: string, init?: EventInit) => act(() => { el.dispatchEvent(new Event(type, { bubbles: true, ...init })); });
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
const type = (el: Element, value: string) => act(() => { (el as HTMLInputElement).value = value; el.dispatchEvent(new Event('input', { bubbles: true })); });

describe('ReadingCapsule', () => {
  it('lists its controls in the contract order', () => {
    const { bar } = setup();
    const names = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Page 3 of 12', 'Zoom', 'Marker', 'Undo', 'Redo', 'Print', 'Download', 'Feedback', 'Exit full screen']);
    expect(bar.textContent).toContain('lease.pdf');
    expect(bar.textContent!.indexOf('lease.pdf')).toBeLessThan(bar.textContent!.indexOf('3 / 12'));
  });

  it('leaves Print out without onPrint', () => {
    const { bar } = setup({ onPrint: undefined });
    expect(bar.querySelector('[aria-label="Print"]')).toBeNull();
  });

  it('folds file name, Redo, Print and Download into More under 600px', () => {
    const { bar } = setup({}, 500);
    const names = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Page 3 of 12', 'Zoom', 'Marker', 'Undo', 'More', 'Exit full screen']);
    click(byLabel('More'));
    const items = [...q('[role="menu"]')!.children].map((c) => c.textContent);
    expect(items).toEqual(['lease.pdf', 'Redo', 'Print', 'Download', 'Feedback']);
  });

  it('shows More only for two or more actions; a lone one is its own button', () => {
    expect(moreDisplay([], [])).toBe('none');
    expect(moreDisplay([], [{ onSelect() {} }])).toBe('lone');
    expect(moreDisplay([], [{ onSelect() {} }, { onSelect() {} }])).toBe('menu');
    expect(moreDisplay([{ onSelect() {} }], [{ onSelect() {} }])).toBe('menu');
    // The file name has no action, so it does not make a second item.
    expect(moreDisplay([{}], [{ onSelect() {} }])).toBe('lone');
  });

  it('renders a lone More item as an icon button with its label, in More\'s place', () => {
    const { bar, props } = setup();
    expect(bar.querySelector('[aria-label="More"]')).toBeNull();
    const b = byLabel('Feedback') as HTMLButtonElement;
    expect(b.title).toBe('Feedback');
    expect(b.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 16 16');
    click(b);
    expect(props.moreItems[0].onSelect).toHaveBeenCalledTimes(1);
  });

  it('keeps More when two items remain', () => {
    const { bar } = setup({ moreItems: [{ label: 'Feedback', onSelect: vi.fn() }, { label: 'Other', onSelect: vi.fn() }] });
    expect(bar.querySelector('[aria-label="More"]')).not.toBeNull();
  });

  it('knows which items fold', () => {
    expect(foldedItems(FOLD_BELOW_PX)).toEqual([]);
    expect(foldedItems(FOLD_BELOW_PX - 1)).toEqual(['file', 'redo', 'print', 'download']);
  });

  it('wakes on pointerenter and dozes on a page press once it is left', () => {
    const { bar, press } = setup();
    expect(bar.dataset.mode).toBe('dozing');
    fire(bar, 'pointerenter', { bubbles: false });
    expect(bar.dataset.mode).toBe('awake');
    act(() => press.emit());
    expect(bar.dataset.mode).toBe('awake'); // still hovered
    fire(bar, 'pointerleave', { bubbles: false });
    expect(bar.dataset.mode).toBe('awake');
    act(() => press.emit());
    expect(bar.dataset.mode).toBe('dozing');
  });

  it('stays awake through a page press while a slot reports its panel open', () => {
    let report: (open: boolean) => void = () => {};
    const { bar, press } = setup({ markerSlot: (onOpenChange) => { report = onOpenChange; return <button type="button" aria-label="Marker">M</button>; } });
    act(() => report(true));
    expect(bar.dataset.mode).toBe('awake');
    act(() => press.emit());
    expect(bar.dataset.mode).toBe('awake');
    act(() => report(false));
    act(() => press.emit());
    expect(bar.dataset.mode).toBe('dozing');
  });

  it('stays awake while the Marker panel is open, though the zoom menu opened and closed meanwhile', () => {
    let marker: (open: boolean) => void = () => {};
    let zoom: (open: boolean) => void = () => {};
    const { bar, press } = setup({
      markerSlot: (onOpenChange) => { marker = onOpenChange; return <button type="button" aria-label="Marker">M</button>; },
      zoomSlot: (onOpenChange) => { zoom = onOpenChange; return <button type="button" aria-label="Zoom">100%</button>; },
    });
    act(() => marker(true));
    act(() => zoom(true));
    act(() => zoom(false));
    act(() => press.emit());
    expect(bar.dataset.mode).toBe('awake');
    act(() => marker(false));
    act(() => press.emit());
    expect(bar.dataset.mode).toBe('dozing');
  });

  it('switching from the page menu to More and closing More lets it doze', () => {
    const { bar, press } = setup({ moreItems: [{ label: 'Feedback', onSelect: vi.fn() }, { label: 'Replace', onSelect: vi.fn() }] });
    click(byLabel('Page 3 of 12'));
    click(byLabel('More'));
    click(byLabel('More'));
    act(() => press.emit());
    expect(bar.dataset.mode).toBe('dozing');
  });

  it('dozes after more than 24px of scrolling', () => {
    const { bar, scroll } = setup();
    fire(bar, 'pointerenter', { bubbles: false });
    fire(bar, 'pointerleave', { bubbles: false });
    act(() => scroll.emit(10));
    expect(bar.dataset.mode).toBe('awake');
    act(() => scroll.emit(15));
    expect(bar.dataset.mode).toBe('dozing');
  });

  it('the page counter opens a jump menu that sends the page and wakes the capsule', () => {
    const { bar, props } = setup();
    click(byLabel('Page 3 of 12'));
    expect(bar.dataset.mode).toBe('awake');
    type(q('input[type=number]')!, '7');
    click(byText('Go'));
    expect(props.onJumpToPage).toHaveBeenCalledWith(7);
    expect(q('input[type=number]')).toBeNull();
  });

  it('ignores a page outside the document', () => {
    const { props } = setup();
    click(byLabel('Page 3 of 12'));
    type(q('input[type=number]')!, '99');
    click(byText('Go'));
    expect(props.onJumpToPage).not.toHaveBeenCalled();
  });

  it('does not undo when it cannot', () => {
    const { props } = setup({ canUndo: false });
    click(byLabel('Undo'));
    expect(props.onUndo).not.toHaveBeenCalled();
  });

  it('closes the jump menu when another capsule control, such as the zoom slot, is pressed', () => {
    setup();
    click(byLabel('Page 3 of 12'));
    expect(q('input[type=number]')).not.toBeNull();
    const zoom = byLabel('Zoom');
    fire(zoom, 'pointerdown');
    click(zoom);
    expect(q('input[type=number]')).toBeNull();
  });

  it('keeps the jump menu open when its own form is pressed', () => {
    setup();
    click(byLabel('Page 3 of 12'));
    fire(q('input[type=number]')!, 'pointerdown');
    expect(q('input[type=number]')).not.toBeNull();
  });
});

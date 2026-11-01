import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import ReadingCapsule, { type ReadingCapsuleProps } from './ReadingCapsule.tsx';
import { foldedItems, FOLD_BELOW_PX } from './capsuleItems.ts';

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
    zoomSlot: <button type="button" aria-label="Zoom">100%</button>,
    markerSlot: <button type="button" aria-label="Marker">M</button>,
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
    expect(names).toEqual(['Page 3 of 12', 'Zoom', 'Marker', 'Undo', 'Redo', 'Print', 'Download', 'More', 'Leave the reading lamp']);
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
    expect(names).toEqual(['Page 3 of 12', 'Zoom', 'Marker', 'Undo', 'More', 'Leave the reading lamp']);
    click(byLabel('More'));
    const items = [...q('[role="menu"]')!.children].map((c) => c.textContent);
    expect(items).toEqual(['lease.pdf', 'Redo', 'Print', 'Download', 'Feedback']);
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

  describe('bar variant', () => {
    it('has no file name, and Enter in place of Exit', () => {
      const { bar, props } = setup({ variant: 'bar', onEnter: vi.fn(), onExit: undefined });
      expect(bar.textContent).not.toContain('lease.pdf');
      expect(bar.querySelector('[aria-label="Leave the reading lamp"]')).toBeNull();
      click(byLabel('Use the reading lamp'));
      expect(props.onEnter).toHaveBeenCalled();
      const names = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
      expect(names).toEqual(['Page 3 of 12', 'Zoom', 'Marker', 'Undo', 'Redo', 'Print', 'Download', 'More', 'Use the reading lamp']);
    });

    it('stays awake through a page press and a 100px scroll', () => {
      const { bar, scroll, press } = setup({ variant: 'bar', onEnter: vi.fn() });
      expect(bar.dataset.mode).toBe('awake');
      act(() => press.emit());
      act(() => scroll.emit(100));
      expect(bar.dataset.mode).toBe('awake');
    });

    it('folds Redo, Print and Download under 600px, with no file name entry', () => {
      const { bar } = setup({ variant: 'bar', onEnter: vi.fn() }, 500);
      click(byLabel('More'));
      expect([...q('[role="menu"]')!.children].map((c) => c.textContent)).toEqual(['Redo', 'Print', 'Download', 'Feedback']);
      expect(bar.dataset.mode).toBe('awake');
    });
  });
});

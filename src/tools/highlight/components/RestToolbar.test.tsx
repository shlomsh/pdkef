import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { HIGHLIGHT_COLORS } from '../lib/marker/markerState.ts';
import { toolbarScaleOriginCss } from '#editor-ui/hooks/visualViewportClamp.ts';
import RestToolbar, { MarkHint } from './RestToolbar.tsx';

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: HIGHLIGHT_COLORS[0].hex, bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};

let page: HTMLElement;
let host: HTMLElement;
const onChange = vi.fn();
const onDelete = vi.fn();
const onComment = vi.fn();
const onClose = vi.fn();

function mount(el: HighlightElement = mark) {
  act(() => render(<RestToolbar mark={el} onChange={onChange} onDelete={onDelete} onComment={onComment} onClose={onClose} />, host));
  return host.querySelector<HTMLElement>('[role="toolbar"]')!;
}
const button = (name: string) => host.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const key = (k: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });

beforeEach(() => {
  vi.useFakeTimers();
  page = document.createElement('div');
  page.setAttribute('data-page-wrapper', '');
  page.style.position = 'relative';
  document.body.appendChild(page);
  host = page;
});

afterEach(() => {
  act(() => render(null, host));
  page.remove();
  vi.useRealTimers();
  onChange.mockClear();
  onDelete.mockClear();
  onComment.mockClear();
  onClose.mockClear();
});

describe('RestToolbar placement (Sign floating hook)', () => {
  it('an LTR mark starts the bar at its left edge, scaling about the top-start corner', () => {
    expect(mount().style.transformOrigin).toBe(toolbarScaleOriginCss('top-start'));
  });

  it('an RTL mark ends the bar at its right edge, scaling about the top-end corner', () => {
    expect(mount({ ...mark, direction: 'rtl' }).style.transformOrigin).toBe(toolbarScaleOriginCss('top-end'));
  });

  it('the bar is always above the mark', () => {
    expect(mount().dataset.side).toBe('above');
  });
});

describe('RestToolbar', () => {
  it('R27: a Comment button sits right after Underline and asks the caller to open the comment', () => {
    const bar = mount();
    const buttons = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(buttons.indexOf('Comment')).toBe(buttons.indexOf('Underline') + 1);
    click(button('Comment'));
    expect(onComment).toHaveBeenCalledTimes(1);
  });

  it('is a toolbar with a named Highlight, Underline, Comment and Delete', () => {
    const bar = mount();
    expect(bar.getAttribute('aria-label')).toBe('Change this highlight');
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('true');
    expect(button('Underline').getAttribute('aria-pressed')).toBe('false');
    expect(button('Delete')).not.toBeNull();
    expect(button('Comment')).not.toBeNull();
  });

  it('shows the underline as the pressed style on an underlined mark', () => {
    mount({ ...mark, style: 'underline' });
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('false');
    expect(button('Underline').getAttribute('aria-pressed')).toBe('true');
  });

  it('Underline asks for underline, and for a highlight when it is already on', () => {
    mount();
    click(button('Underline'));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    mount({ ...mark, style: 'underline' });
    click(button('Underline'));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
  });

  it('Delete deletes', () => {
    mount();
    click(button('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a click on Highlight opens the six colors and a plus, and a pick folds them away', () => {
    mount();
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(0);
    click(button('Highlight'));
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(6);
    expect(button('Custom color and opacity')).not.toBeNull();
    click(host.querySelectorAll('[data-highlight-swatch]')[2]);
    expect(onChange).toHaveBeenLastCalledWith({ color: HIGHLIGHT_COLORS[2].hex });
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(0);
  });

  it('clicking Highlight on an underlined mark switches back to a highlight and opens the colors', () => {
    mount({ ...mark, style: 'underline' });
    click(button('Highlight'));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(6);
  });

  it('resting a mouse on Highlight for 450 ms opens the colors; passing over does not', () => {
    mount();
    const enter = (type: string) => act(() => {
      const e = new MouseEvent(type, { bubbles: false });
      Object.defineProperty(e, 'pointerType', { value: 'mouse' });
      button('Highlight').dispatchEvent(e);
    });
    enter('pointerenter');
    act(() => { vi.advanceTimersByTime(300); });
    enter('pointerleave');
    act(() => { vi.advanceTimersByTime(300); });
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(0);
    enter('pointerenter');
    act(() => { vi.advanceTimersByTime(451); });
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(6);
  });

  it('the plus opens a color input and an opacity slider from 30 to 100', () => {
    mount();
    click(button('Highlight'));
    click(button('Custom color and opacity'));
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(range.min).toBe('30');
    expect(range.max).toBe('100');
    expect(range.getAttribute('aria-label')).toBe('Opacity');
    act(() => { range.value = '55'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.55 });
    const picker = host.querySelector<HTMLInputElement>('input[type="color"]')!;
    expect(picker.getAttribute('aria-label')).toBe('Custom color');
    act(() => { picker.value = '#aabbcc'; picker.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ color: '#AABBCC' });
  });

  it('reads the mark opacity into the slider', () => {
    mount({ ...mark, opacity: 0.6 });
    click(button('Highlight'));
    click(button('Custom color and opacity'));
    expect(host.querySelector<HTMLInputElement>('input[type="range"]')!.value).toBe('60');
  });
});

describe('RestToolbar keys', () => {
  it('1 to 6 pick a color', () => {
    mount();
    key('3');
    expect(onChange).toHaveBeenLastCalledWith({ color: HIGHLIGHT_COLORS[2].hex });
  });

  it('U toggles the underline and Delete deletes', () => {
    mount();
    key('u');
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    key('Delete');
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keys typed into a field are left alone', () => {
    mount();
    click(button('Highlight'));
    click(button('Custom color and opacity'));
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    key('3', {}, range);
    key('Delete', {}, range);
    expect(onChange).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('Esc closes one layer at a time: custom, colors, then the toolbar', () => {
    mount();
    click(button('Highlight'));
    click(button('Custom color and opacity'));
    key('Escape');
    expect(host.querySelector('input[type="range"]')).toBeNull();
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(6);
    key('Escape');
    expect(host.querySelectorAll('[data-highlight-swatch]')).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('arrow keys move focus along the buttons', () => {
    mount();
    button('Highlight').focus();
    key('ArrowRight', {}, button('Highlight'));
    expect(document.activeElement).toBe(button('Underline'));
    key('End', {}, button('Underline'));
    expect(document.activeElement).toBe(button('Delete'));
    key('Home', {}, button('Delete'));
    expect(document.activeElement).toBe(button('Highlight'));
  });
});

describe('RestToolbar closing', () => {
  const press = (target: Element) => act(() => { target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });

  it('closes on a press elsewhere, not on a press inside it', () => {
    mount();
    press(button('Underline'));
    expect(onClose).not.toHaveBeenCalled();
    press(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a scroll of more than 24 px', () => {
    mount();
    Object.defineProperty(window, 'scrollY', { value: 20, configurable: true, writable: true });
    act(() => { document.dispatchEvent(new Event('scroll')); });
    expect(onClose).not.toHaveBeenCalled();
    Object.defineProperty(window, 'scrollY', { value: 40, configurable: true, writable: true });
    act(() => { document.dispatchEvent(new Event('scroll')); });
    expect(onClose).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  });
});

describe('MarkHint', () => {
  it('shows its text beside the end of the ink', () => {
    act(() => render(<MarkHint anchor={{ x: 40, bottom: 12, rtl: false }} text="Rest on a highlight to change it" />, host));
    const hint = host.querySelector<HTMLElement>('[data-mark-hint]')!;
    expect(hint.textContent).toBe('Rest on a highlight to change it');
    expect(hint.style.left).toBe('40%');
    expect(hint.style.top).toBe('12%');
  });
});

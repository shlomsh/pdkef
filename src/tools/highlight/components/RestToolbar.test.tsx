import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { HIGHLIGHT_COLORS } from '../lib/marker/markerState.ts';
import controls from '#editor-ui/EditorControls.module.css';
import elementStyles from '#editor-ui/EditorElement.module.css';
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
  it('(a) the root is Sign\'s element toolbar container', () => {
    expect(mount().className).toContain(elementStyles.actions);
  });

  const controlsOf = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>('button')].map((b) =>
    b.classList.contains(controls['color-trigger']) ? 'Color'
      : b.getAttribute('aria-label') ?? (b.getAttribute('aria-haspopup') ? 'Thickness' : b.title));
  const thicknessTrigger = () => [...host.querySelectorAll<HTMLElement>('[aria-haspopup]')].find((b) => !b.classList.contains(controls['color-trigger']))!;

  it('(a) the controls in order are Color, the Highlight | Underline toggle with its thickness caret, Comment, Delete', () => {
    const bar = mount();
    expect(bar.getAttribute('aria-label')).toBe('Change this highlight');
    expect(controlsOf(bar)).toEqual(['Color', 'Highlight', 'Underline', 'Thickness', 'Comment', 'Delete']);
    expect(bar.querySelectorAll('[data-highlight-swatch]')).toHaveLength(0);
    expect(bar.querySelectorAll(`.${controls.divider}`)).toHaveLength(2);
  });

  it('(b) the same controls are present on an underline', () => {
    expect(controlsOf(mount({ ...mark, style: 'underline' }))).toEqual(['Color', 'Highlight', 'Underline', 'Thickness', 'Comment', 'Delete']);
  });

  it('(c) Highlight and Underline are icons in one toggle: the current style is pressed, the other one switches to it', () => {
    mount();
    expect(button('Highlight').querySelector('svg')).not.toBeNull();
    expect(button('Underline').querySelector('svg')).not.toBeNull();
    expect(button('Highlight').textContent).toBe('');
    expect(button('Highlight').closest('[data-style-toggle]')).toBe(button('Underline').closest('[data-style-toggle]'));
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('true');
    expect(button('Highlight').className).toContain(controls.active);
    expect(button('Underline').getAttribute('aria-pressed')).toBe('false');
    click(button('Highlight'));
    expect(onChange).not.toHaveBeenCalled();
    click(button('Underline'));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    mount({ ...mark, style: 'underline' });
    expect(button('Underline').getAttribute('aria-pressed')).toBe('true');
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('false');
    click(button('Highlight'));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
  });

  it('(c2) the thickness caret belongs to the Underline segment: one pill holds both, filled together, and the U draws its bar at the chosen thickness', () => {
    mount({ ...mark, style: 'underline', strokeWidth: 3 });
    const segment = button('Underline').parentElement!;
    expect(segment.contains(thicknessTrigger())).toBe(true);
    expect(segment.contains(button('Highlight'))).toBe(false);
    expect(segment.hasAttribute('data-on')).toBe(true);
    const bar = (b: HTMLElement) => b.querySelectorAll('path')[1].getAttribute('stroke-width');
    const thick = bar(button('Underline'));
    mount({ ...mark, style: 'underline', strokeWidth: 1 });
    expect(Number(bar(button('Underline')))).toBeLessThan(Number(thick));
    mount();
    expect(button('Underline').parentElement!.hasAttribute('data-on')).toBe(false);
  });

  it('(d) 3 pt from the thickness menu on a highlight makes it a 3 pt underline in one change', () => {
    mount();
    click(thicknessTrigger());
    click(document.querySelector('[data-editor-thickness="3"]')!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline', strokeWidth: 3 });
  });

  it('(e) the color menu shows the six presets, the custom square and, on a highlight, a labelled Opacity slider', () => {
    mount({ ...mark, opacity: 0.8 });
    expect(host.querySelector('input[type="range"]')).toBeNull();
    click(host.querySelector(`.${controls['color-trigger']}`)!);
    const swatches = [...document.querySelectorAll('[data-editor-popover] [data-editor-color-swatch]')].map((el) => el.getAttribute('title'));
    expect(swatches).toEqual(['Yellow', 'Orange', 'Pink', 'Red', 'Green', 'Blue']);
    expect(document.querySelector('[data-editor-popover] input[type="color"]')).not.toBeNull();
    const range = document.querySelector<HTMLInputElement>('[data-editor-popover] input[type="range"]')!;
    expect(range.min).toBe('0.3');
    expect(range.max).toBe('1');
    expect(range.value).toBe('0.8');
    expect(range.labels?.[0].textContent).toContain('Opacity');
    expect(range.closest('[data-opacity-slider]')).not.toBeNull();
    act(() => { range.value = '0.5'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.5 });
  });

  it('R27: Comment asks the caller to open the comment', () => {
    mount();
    click(button('Comment'));
    expect(onComment).toHaveBeenCalledTimes(1);
  });

  it('Delete is the danger button and deletes', () => {
    mount();
    expect(button('Delete').className).toContain(controls['element-button-danger']);
    click(button('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('(e) an underline color menu has no opacity slider', () => {
    mount({ ...mark, style: 'underline' });
    click(host.querySelector(`.${controls['color-trigger']}`)!);
    expect(document.querySelector('[data-editor-popover] input[type="range"]')).toBeNull();
  });

  it('(f) the bar itself holds no native color input', () => {
    mount();
    expect(host.querySelector('input[type="color"]')).toBeNull();
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

  it('C opens the comment', () => {
    mount();
    key('c');
    expect(onComment).toHaveBeenCalledTimes(1);
  });

  it('Esc closes the toolbar', () => {
    mount();
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('arrow keys move focus along the buttons', () => {
    mount();
    const color = host.querySelector<HTMLElement>(`.${controls['color-trigger']}`)!;
    color.focus();
    key('ArrowRight', {}, color);
    expect(document.activeElement).toBe(button('Highlight'));
    key('End', {}, button('Highlight'));
    expect(document.activeElement).toBe(button('Delete'));
    key('Home', {}, button('Delete'));
    expect(document.activeElement).toBe(color);
  });
});

describe('RestToolbar follows the interface direction (READ-04)', () => {
  const rtlMark: HighlightElement = { ...mark, direction: 'rtl' };

  it('an RTL mark does not mirror the bar: no dir attribute', () => {
    const bar = mount(rtlMark);
    expect(bar.hasAttribute('dir')).toBe(false);
    expect(bar.closest('[dir="rtl"]')).toBeNull();
  });

  it('Arrow Right moves to the next button in DOM order under the LTR interface, for an RTL mark', () => {
    mount(rtlMark);
    const color = host.querySelector<HTMLElement>(`.${controls['color-trigger']}`)!;
    color.focus();
    key('ArrowRight', {}, color);
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

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { HIGHLIGHT_COLORS } from '../lib/marker/markerState.ts';
import { EXTRA_HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
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

  it('(b) six swatches, a color menu trigger, dividers, and pressed Highlight/Underline toggles', () => {
    const bar = mount();
    expect(bar.getAttribute('aria-label')).toBe('Change this highlight');
    expect(bar.querySelectorAll('[data-highlight-swatch]')).toHaveLength(6);
    expect(bar.querySelector(`[aria-haspopup].${controls['color-trigger']}`)).not.toBeNull();
    expect(bar.querySelectorAll(`.${controls.divider}`).length).toBeGreaterThanOrEqual(2);
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('true');
    expect(button('Underline').getAttribute('aria-pressed')).toBe('false');
    expect(button('Highlight').className).toContain(controls.active);
  });

  it('shows the underline as the pressed style on an underlined mark', () => {
    mount({ ...mark, style: 'underline' });
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('false');
    expect(button('Underline').getAttribute('aria-pressed')).toBe('true');
  });

  it('a style button asks for its style', () => {
    mount();
    click(button('Underline'));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    mount({ ...mark, style: 'underline' });
    click(button('Highlight'));
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
  });

  it('a swatch picks its color', () => {
    mount();
    click(host.querySelectorAll('[data-highlight-swatch]')[2]);
    expect(onChange).toHaveBeenLastCalledWith({ color: HIGHLIGHT_COLORS[2].hex });
  });

  it('R27: Comment follows the style toggles and asks the caller to open the comment', () => {
    const bar = mount();
    const labels = [...bar.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.title);
    expect(labels.indexOf('Comment')).toBeGreaterThan(labels.indexOf('Underline'));
    click(button('Comment'));
    expect(onComment).toHaveBeenCalledTimes(1);
  });

  it('(c) Delete is the danger button and deletes', () => {
    mount();
    expect(button('Delete').className).toContain(controls['element-button-danger']);
    click(button('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('(d) the color menu holds 6 extra presets and an opacity slider', () => {
    mount({ ...mark, opacity: 0.8 });
    expect(host.querySelector('input[type="range"]')).toBeNull();
    click(host.querySelector(`.${controls['color-trigger']}`)!);
    const swatches = [...document.querySelectorAll('[data-editor-popover] [data-editor-color-swatch]')].map((el) => el.getAttribute('title'));
    expect(swatches).toEqual(EXTRA_HIGHLIGHT_COLORS.map((c) => c.hex));
    const range = document.querySelector<HTMLInputElement>('[data-editor-popover] input[type="range"]')!;
    expect(range.min).toBe('0.3');
    expect(range.max).toBe('1');
    expect(range.getAttribute('aria-label')).toBe('Opacity');
    expect(range.value).toBe('0.8');
    act(() => { range.value = '0.5'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 0.5 });
  });

  it('(e) an underline has a thickness picker and no opacity slider', () => {
    mount({ ...mark, style: 'underline' });
    const triggers = [...host.querySelectorAll<HTMLElement>('[aria-haspopup]')].filter((b) => !b.classList.contains(controls['color-trigger']));
    expect(triggers).toHaveLength(1);
    click(triggers[0]);
    click(document.querySelector('[data-editor-thickness="3"]')!);
    expect(onChange).toHaveBeenLastCalledWith({ strokeWidth: 3 });
    click(host.querySelector(`.${controls['color-trigger']}`)!);
    expect(document.querySelector('[data-editor-popover] input[type="range"]')).toBeNull();
  });

  it('a highlight has no thickness picker', () => {
    mount();
    expect([...host.querySelectorAll('[aria-haspopup]')]).toHaveLength(1);
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
    button('Highlight').focus();
    key('ArrowRight', {}, button('Highlight'));
    expect(document.activeElement).toBe(button('Underline'));
    key('End', {}, button('Underline'));
    expect(document.activeElement).toBe(button('Delete'));
    key('Home', {}, button('Delete'));
    expect(document.activeElement).toBe(host.querySelector('[data-highlight-swatch]'));
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
    button('Highlight').focus();
    key('ArrowRight', {}, button('Highlight'));
    expect(document.activeElement).toBe(button('Underline'));
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

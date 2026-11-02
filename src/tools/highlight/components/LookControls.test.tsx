import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import { StyleSetting, StyleToggle } from './LookControls.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(look = DEFAULT_MARKER, onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<><StyleToggle look={look} onChange={onChange} /><StyleSetting look={look} onChange={onChange} /></>, container!));
  return onChange;
}
const button = (name: string) => container!.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;

describe('StyleToggle', () => {
  it('holds the two kinds of mark, Highlight and Underline, and no caret: Pencil is a look of a highlight, not a kind', () => {
    mount();
    expect([...container!.querySelectorAll('[data-style-toggle] button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Highlight', 'Underline']);
    expect(container!.querySelectorAll('[data-style-toggle] [aria-haspopup]')).toHaveLength(0);
  });

  it('is a radio group named Style, the current style checked and the only tab stop', () => {
    mount();
    const group = container!.querySelector('[data-style-toggle]')!;
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Style');
    expect(button('Highlight').getAttribute('role')).toBe('radio');
    expect(button('Highlight').getAttribute('aria-checked')).toBe('true');
    expect(button('Underline').getAttribute('aria-checked')).toBe('false');
    expect(button('Highlight').hasAttribute('aria-pressed')).toBe(false);
    expect([button('Highlight').tabIndex, button('Underline').tabIndex]).toEqual([0, -1]);
    act(() => render(null, container!)); container!.remove(); container = null;
    mount({ ...DEFAULT_MARKER, style: 'underline' });
    expect(button('Underline').getAttribute('aria-checked')).toBe('true');
    expect(button('Highlight').getAttribute('aria-checked')).toBe('false');
  });

  it('arrow keys switch the style either way and wrap', () => {
    const onChange = mount();
    button('Highlight').focus();
    act(() => { button('Highlight').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    expect(document.activeElement).toBe(button('Underline'));
  });

  it('a pencil mark is a highlight: Highlight is checked and clicking it keeps the pencil', () => {
    const onChange = mount({ ...DEFAULT_MARKER, style: 'pencil' });
    expect(button('Highlight').getAttribute('aria-checked')).toBe('true');
    expect(button('Underline').getAttribute('aria-checked')).toBe('false');
    expect(button('Highlight').tabIndex).toBe(0);
    act(() => button('Highlight').click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => button('Underline').click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
  });

  it('the other style button switches to it, and the pressed one does nothing', () => {
    const onChange = mount();
    act(() => button('Highlight').click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => button('Underline').click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
  });
});

describe('StyleSetting', () => {
  it('on an underline, choosing a thickness selects Underline with it', () => {
    const onChange = mount({ ...DEFAULT_MARKER, style: 'underline' });
    act(() => button('Underline thickness').click());
    act(() => (document.querySelector('[data-editor-thickness="4"]') as HTMLElement).click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline', strokeWidth: 4 });
  });

  it('the highlight face shows the percent on paper and no dot', () => {
    mount({ ...DEFAULT_MARKER, opacity: 0.5 });
    const face = button('Opacity');
    expect(face.querySelector('[data-setting-dot]')).toBeNull();
    expect(face.textContent).toContain('50%');
  });

  it('the opacity face and the underline face are one box, so toggling the style does not move the row', () => {
    mount();
    const highlightFace = button('Opacity').querySelector('[data-setting-face]')!;
    expect(highlightFace.className).not.toBe('');
    act(() => render(null, container!)); container!.remove(); container = null;
    mount({ ...DEFAULT_MARKER, style: 'underline' });
    const lineFace = button('Underline thickness').querySelector('[data-setting-line]')!;
    expect(lineFace.className.split(' ')).toContain(highlightFace.className.split(' ')[0]);
    expect(highlightFace.className.split(' ')).toContain(lineFace.className.split(' ')[0]);
  });

  it('the underline popover shows the stroke scraps above the thickness items', () => {
    mount({ ...DEFAULT_MARKER, style: 'underline' });
    act(() => button('Underline thickness').click());
    expect(document.querySelector('[role="radiogroup"][aria-label="Stroke"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-editor-thickness]').length).toBe(5);
  });

  it('a pencil shows its percent over hatching, and its popover holds the same 3-way toggle with Pencil checked', () => {
    const onChange = mount({ ...DEFAULT_MARKER, style: 'pencil', opacity: 0.6 });
    expect(button('Opacity').textContent).toContain('60%');
    expect(button('Opacity').querySelector('[data-setting-face] [data-stroke-mark="hatch"]')).not.toBeNull();
    act(() => button('Opacity').click());
    const pencil = document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Stroke"] [aria-label="Pencil"]')!;
    expect(pencil.getAttribute('aria-checked')).toBe('true');
    const range = document.querySelector('[data-opacity-slider] input') as HTMLInputElement;
    range.value = '0.7';
    act(() => { range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ style: 'pencil', opacity: 0.7 });
    act(() => (document.querySelector('[role="radiogroup"][aria-label="Stroke"] [aria-label="Sketch"]') as HTMLElement).click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight', stroke: 'sketch' });
  });

  it('a highlight picks Pencil from the 3-way toggle in its opacity popover', () => {
    const onChange = mount();
    act(() => button('Opacity').click());
    const radios = [...document.querySelectorAll('[role="radiogroup"][aria-label="Stroke"] [role="radio"]')];
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Clean', 'Sketch', 'Pencil']);
    act(() => (radios[2] as HTMLElement).click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'pencil' });
  });

  it('the underline popover offers Clean and Sketch only', () => {
    mount({ ...DEFAULT_MARKER, style: 'underline' });
    act(() => button('Underline thickness').click());
    expect([...document.querySelectorAll('[role="radiogroup"][aria-label="Stroke"] [role="radio"]')].map((r) => r.getAttribute('aria-label'))).toEqual(['Clean', 'Sketch']);
  });
});

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
  it('holds the two style buttons and no caret', () => {
    mount();
    expect(container!.querySelectorAll('[data-style-toggle] button')).toHaveLength(2);
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

  it('arrow keys switch the style either way', () => {
    const onChange = mount();
    button('Highlight').focus();
    act(() => { button('Highlight').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ style: 'underline' });
    expect(document.activeElement).toBe(button('Underline'));
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

  it('the underline popover shows the stroke scraps above the thickness items', () => {
    mount({ ...DEFAULT_MARKER, style: 'underline' });
    act(() => button('Underline thickness').click());
    expect(document.querySelector('[role="radiogroup"][aria-label="Stroke"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-editor-thickness]').length).toBe(5);
  });
});

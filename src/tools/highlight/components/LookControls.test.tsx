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

  it('presses the current style', () => {
    mount();
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('true');
    expect(button('Underline').getAttribute('aria-pressed')).toBe('false');
    mount({ ...DEFAULT_MARKER, style: 'underline' });
    expect(button('Underline').getAttribute('aria-pressed')).toBe('true');
    expect(button('Highlight').getAttribute('aria-pressed')).toBe('false');
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
});

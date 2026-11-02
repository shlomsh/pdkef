import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import controls from '#editor-ui/EditorControls.module.css';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import LookControls from './LookControls.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(look = DEFAULT_MARKER, onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<LookControls look={look} onChange={onChange} />, container!));
  return onChange;
}
const button = (name: string) => container!.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;

describe('LookControls', () => {
  it('renders the color trigger and the Highlight | Underline toggle', () => {
    mount();
    expect(container!.querySelector(`.${controls['color-trigger']}`)).not.toBeNull();
    expect(button('Highlight').closest('[data-style-toggle]')).toBe(button('Underline').closest('[data-style-toggle]'));
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

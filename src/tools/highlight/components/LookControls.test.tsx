import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import controls from '#editor-ui/EditorControls.module.css';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';
import LookControls, { StyleToggle } from './LookControls.tsx';

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

describe('StyleToggle', () => {
  function mountToggle(look = DEFAULT_MARKER, onChange = vi.fn(), tone?: 'light') {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => render(<StyleToggle look={look} onChange={onChange} tone={tone} />, container!));
    return onChange;
  }

  it('holds the two style buttons and a caret for each, without the color menu', () => {
    mountToggle();
    expect(container!.querySelector('[data-style-toggle]')).not.toBeNull();
    expect(container!.querySelector(`.${controls['color-trigger']}`)).toBeNull();
    expect(container!.querySelectorAll('[data-style-toggle] button[aria-haspopup]')).toHaveLength(2);
  });

  it('the highlight caret opens the opacity and choosing one selects Highlight with it', () => {
    const onChange = mountToggle({ ...DEFAULT_MARKER, style: 'underline' });
    act(() => container!.querySelector<HTMLElement>('button[title="Opacity"]')!.click());
    const range = document.querySelector<HTMLInputElement>('[data-opacity-slider] input')!;
    act(() => { range.value = '0.5'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight', opacity: 0.5 });
  });

  it('switches the style and presses the current one', () => {
    const onChange = mountToggle({ ...DEFAULT_MARKER, style: 'underline' });
    expect(button('Underline').getAttribute('aria-pressed')).toBe('true');
    act(() => button('Highlight').click());
    expect(onChange).toHaveBeenLastCalledWith({ style: 'highlight' });
  });

  it('the light tone is a variant of the same toggle', () => {
    mountToggle(DEFAULT_MARKER, vi.fn(), 'light');
    expect(container!.querySelector('[data-style-toggle]')!.className).not.toBe(mountDarkClass());
  });
});

function mountDarkClass() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  act(() => render(<StyleToggle look={DEFAULT_MARKER} onChange={vi.fn()} />, el));
  const name = el.querySelector('[data-style-toggle]')!.className;
  act(() => render(null, el));
  el.remove();
  return name;
}

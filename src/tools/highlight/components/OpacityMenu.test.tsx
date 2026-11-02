import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OpacityMenu from './OpacityMenu.tsx';
import { ToolbarScale } from './toolbarScale.ts';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<OpacityMenu value={0.8} onChange={onChange} />, container!));
  return onChange;
}
const trigger = () => container!.querySelector<HTMLElement>('button[aria-haspopup]')!;
const range = () => document.querySelector<HTMLInputElement>('[data-opacity-slider] input');

describe('OpacityMenu', () => {
  it('is a caret that holds the slider closed until it is opened', () => {
    mount();
    expect(trigger().title).toBe('Opacity');
    expect(range()).toBeNull();
    act(() => trigger().click());
    expect(range()!.value).toBe('0.8');
  });

  it('the slider reports the opacity', () => {
    const onChange = mount();
    act(() => trigger().click());
    const input = range()!;
    act(() => { input.value = '0.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('Escape closes it', () => {
    mount();
    act(() => trigger().click());
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(range()).toBeNull();
  });

  it('shows the stroke scraps above the slider when given a stroke handler', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const onStroke = vi.fn();
    act(() => render(<OpacityMenu value={0.8} onChange={() => {}} color="#ff8fcf" onStroke={onStroke} />, container!));
    act(() => trigger().click());
    const sketch = document.querySelector<HTMLElement>('[role="radiogroup"][aria-label="Stroke"] [aria-label="Sketch"]')!;
    act(() => sketch.click());
    expect(onStroke).toHaveBeenLastCalledWith({ stroke: 'sketch' });
    expect(range()).not.toBeNull();
  });

  it('counter-scales its popover inside the desktop toolbar, and only there', () => {
    mount();
    act(() => trigger().click());
    expect(document.querySelector('[data-editor-popover] [data-counter-scaled]')).toBeNull();
    act(() => render(null, container!));
    act(() => render(<ToolbarScale.Provider value={true}><OpacityMenu value={0.8} onChange={vi.fn()} /></ToolbarScale.Provider>, container!));
    act(() => trigger().click());
    const menu = document.querySelector<HTMLElement>('[data-editor-popover] [data-counter-scaled]');
    expect(menu).not.toBeNull();
    expect(menu!.getAttribute('style')).toContain('--vv-scale');
  });
});

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StrokeChoice from './StrokeChoice.tsx';

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

function mount(stroke?: 'sketch', underline = false, onChange = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<StrokeChoice stroke={stroke} underline={underline} color="#ff8fcf" onChange={onChange} />, container!));
  return onChange;
}
const radio = (name: string) => container!.querySelector<HTMLElement>(`[role="radio"][aria-label="${name}"]`)!;

describe('StrokeChoice', () => {
  it('is a radiogroup named Stroke with Clean checked when the stroke is absent', () => {
    mount();
    const group = container!.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Stroke');
    expect(radio('Clean').getAttribute('aria-checked')).toBe('true');
    expect(radio('Sketch').getAttribute('aria-checked')).toBe('false');
    expect([radio('Clean').tabIndex, radio('Sketch').tabIndex]).toEqual([0, -1]);
  });

  it('checks Sketch when the stroke is sketch', () => {
    mount('sketch');
    expect(radio('Sketch').getAttribute('aria-checked')).toBe('true');
    expect(radio('Sketch').tabIndex).toBe(0);
  });

  it('picking Sketch reports sketch, picking Clean reports undefined', () => {
    const onChange = mount();
    act(() => radio('Sketch').click());
    expect(onChange).toHaveBeenLastCalledWith({ stroke: 'sketch' });
    act(() => render(null, container!)); container!.remove(); container = null;
    const again = mount('sketch');
    act(() => radio('Clean').click());
    expect(again).toHaveBeenLastCalledWith({ stroke: undefined });
  });

  it('arrow keys move the check and wrap', () => {
    const onChange = mount();
    radio('Clean').focus();
    act(() => { radio('Clean').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(onChange).toHaveBeenLastCalledWith({ stroke: 'sketch' });
    expect(document.activeElement).toBe(radio('Sketch'));
  });

  it('draws the word with an underline when the style is underline', () => {
    mount(undefined, true);
    expect(container!.querySelector('[data-stroke-mark="underline"]')).not.toBeNull();
    expect(container!.querySelector('[data-stroke-mark="band"]')).toBeNull();
  });
});

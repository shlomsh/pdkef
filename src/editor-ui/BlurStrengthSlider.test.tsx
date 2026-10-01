import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlurStrengthSlider, { DEFAULT_TICK_PERCENT } from './BlurStrengthSlider.tsx';
import { renderRedactionSurface } from '../editor/registry/redactionSurface.ts';

const labels = { title: 'Blur strength', lighter: 'Lighter', stronger: 'Stronger', defaultTick: 'Default blur' };
let host: HTMLElement | null = null;

afterEach(() => {
  if (host) render(null, host);
  host?.remove();
  host = null;
});

function mount(onChange: (s: number) => void, value?: unknown) {
  host = document.createElement('div');
  document.body.appendChild(host);
  host.innerHTML = '';
  const box = document.createElement('div');
  box.setAttribute('data-redact-box-id', 'b1');
  const surface = document.createElement('div');
  surface.className = 'redact-surface__blur';
  surface.dataset.boxHeightPt = '100';
  box.appendChild(surface);
  host.appendChild(box);
  const slot = document.createElement('div');
  host.appendChild(slot);
  render(<BlurStrengthSlider elementId="b1" value={value} onChange={onChange} labels={labels} />, slot);
  return { surface, input: slot.querySelector<HTMLInputElement>('[data-editor-blur-strength-input]')! };
}

describe('BlurStrengthSlider', () => {
  it('shows the range, the ends and reads a legacy value', () => {
    const { input } = mount(() => {}, 'strong');
    expect(input.min).toBe('0.05');
    expect(input.max).toBe('0.55');
    expect(input.step).toBe('0.01');
    expect(input.value).toBe('0.5');
    expect(host!.textContent).toContain('Lighter');
    expect(host!.textContent).toContain('Stronger');
    expect(DEFAULT_TICK_PERCENT).toBeCloseTo(50);
  });

  it('paints the box live during the drag and commits once on release, snapped', async () => {
    const onChange = vi.fn();
    const { input, surface } = mount(onChange);
    for (const v of ['0.2', '0.25', '0.31']) {
      await act(async () => {
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    expect(onChange).not.toHaveBeenCalled();
    // 0.31 snapped to 0.3: 0.3 x max(100, 24) / 100 = 0.3.
    expect(surface.style.backdropFilter).toContain('blur(calc(0.3 * 100cqh))');
    expect(input.value).toBe('0.3');
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0.3);
  });

  it('renderRedactionSurface records the box height so the live paint can apply the floor', () => {
    const vnode = renderRedactionSurface('blur', undefined, 0.3, 12) as any;
    const layer = vnode.props.children;
    expect(layer.props['data-box-height-pt']).toBe('12');
  });
});

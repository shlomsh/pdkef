import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlurStrengthSlider from './BlurStrengthSlider.tsx';
import { DEFAULT_BLUR_STRENGTH } from '../../editor/model/blurStrength.ts';
import { renderRedactionSurface } from '../../editor/registry/redactionSurface.ts';

const labels = { title: 'Blur strength', lighter: 'Lighter', stronger: 'Stronger' };
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
  act(() => { render(<BlurStrengthSlider elementId="b1" value={value} onChange={onChange} labels={labels} />, slot); });
  return { surface, input: slot.querySelector<HTMLInputElement>('[data-editor-blur-strength-input]')! };
}

describe('BlurStrengthSlider', () => {
  it('offers only the range where a blur still looks like a blur, and an older, stronger value sits at its end', () => {
    const { input } = mount(() => {}, 'strong');
    expect(input.min).toBe('0.06');
    expect(input.max).toBe('0.24');
    expect(input.step).toBe('0.01');
    expect(input.value).toBe('0.24');
  });

  it('a new box sits in the middle of the track', () => {
    const { input } = mount(() => {}, DEFAULT_BLUR_STRENGTH);
    const [min, max, value] = [input.min, input.max, input.value].map(Number);
    expect((value - min) / (max - min)).toBeCloseTo(0.5, 5);
  });

  it('has no heading text, a notch at the default and two titled marks', () => {
    mount(() => {});
    expect(host!.textContent).toBe('');
    expect(host!.querySelector('[data-editor-blur-strength-notch]')).not.toBeNull();
    expect(host!.querySelector('[data-editor-blur-strength-light]')!.getAttribute('title')).toBe('Lighter');
    expect(host!.querySelector('[data-editor-blur-strength-strong]')!.getAttribute('title')).toBe('Stronger');
  });

  it('double-click resets to the default with exactly one onChange', async () => {
    const onChange = vi.fn();
    const { input, surface } = mount(onChange, 0.5);
    await act(async () => { input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(input.value).toBe('0.15');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(DEFAULT_BLUR_STRENGTH);
    expect(surface.style.backdropFilter).toContain(`blur(calc(${DEFAULT_BLUR_STRENGTH} * 100cqh))`);
  });

  it('paints the box live during the drag and commits once on release, snapped', async () => {
    const onChange = vi.fn();
    const { input, surface } = mount(onChange);
    for (const v of ['0.1', '0.12', '0.16']) {
      await act(async () => {
        input.value = v;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    expect(onChange).not.toHaveBeenCalled();
    // 0.16 snapped to 0.15: 0.15 x max(100, 24) / 100 = 0.15.
    expect(surface.style.backdropFilter).toContain('blur(calc(0.15 * 100cqh))');
    expect(input.value).toBe('0.15');
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0.15);
  });

  it('renderRedactionSurface records the box height so the live paint can apply the floor', () => {
    const vnode = renderRedactionSurface('blur', undefined, 0.3, 12) as any;
    const layer = vnode.props.children;
    expect(layer.props['data-box-height-pt']).toBe('12');
  });
});

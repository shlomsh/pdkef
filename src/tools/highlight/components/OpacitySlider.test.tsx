import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPACITY_MIN } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import OpacitySlider from './OpacitySlider.tsx';

let host: HTMLElement | null = null;
afterEach(() => { if (host) { act(() => render(null, host!)); host.remove(); host = null; } });

function mount(value: number, onChange = vi.fn()) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<OpacitySlider value={value} onChange={onChange} />, host!));
  return { onChange, range: host.querySelector<HTMLInputElement>('input[type="range"]')! };
}

describe('OpacitySlider', () => {
  it('is a labelled range from the opacity floor to 1 that reports opacity as a fraction', () => {
    const { range, onChange } = mount(0.8);
    expect(range.min).toBe(String(OPACITY_MIN));
    expect(range.max).toBe('1');
    expect(range.value).toBe('0.8');
    expect(range.getAttribute('aria-label')).toBe(t.markOpacity);
    act(() => { range.value = '0.5'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it('has a faint and a solid end mark, both hidden from assistive tech', () => {
    mount(1);
    for (const sel of ['[data-opacity-faint]', '[data-opacity-solid]']) {
      const mark = host!.querySelector<HTMLElement>(sel)!;
      expect(mark).not.toBeNull();
      expect(mark.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import LevelPicker, { type Level } from './LevelPicker.tsx';
import { englishCompressMessages, hebrewCompressMessages } from '../messages';

let host: HTMLElement;
afterEach(() => {
  render(null, host);
  host.remove();
});

function mount(props = {}) {
  if (host) {
    render(null, host);
    host.remove();
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  const p = {
    value: 'medium' as Level,
    onChange: vi.fn(),
    t: englishCompressMessages,
    targetKB: 200,
    onTargetKBChange: vi.fn(),
    presets: [100, 200, 500, 1024],
    ...props,
  };
  act(() => render(<LevelPicker {...p} />, host));
  return p;
}
const radios = () => Array.from(host.querySelectorAll('[role="radio"]')) as HTMLElement[];
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });

describe('LevelPicker', () => {
  it('renders four radios in order with exact names', () => {
    mount();
    expect(radios().map((r) => r.textContent)).toEqual(['Smallest', 'Balanced', 'Sharpest', 'Exact size']);
  });

  it('aria-checked follows value, roving tabindex', () => {
    mount({ value: 'low' });
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, 0, -1]);
  });

  it('click calls onChange; the checked one does not', () => {
    const p = mount();
    act(() => radios()[1].click());
    expect(p.onChange).not.toHaveBeenCalled();
    act(() => radios()[0].click());
    expect(p.onChange).toHaveBeenCalledWith('high');
  });

  it('arrow keys move, Home/End jump', () => {
    const p = mount();
    key(radios()[1], 'ArrowRight');
    expect(p.onChange).toHaveBeenLastCalledWith('low');
    key(radios()[1], 'ArrowLeft');
    expect(p.onChange).toHaveBeenLastCalledWith('high');
    key(radios()[1], 'End');
    expect(p.onChange).toHaveBeenLastCalledWith('target');
    key(radios()[1], 'Home');
    expect(p.onChange).toHaveBeenLastCalledWith('high');
  });

  it('wraps from the last to the first', () => {
    const p = mount({ value: 'target' });
    key(radios()[3], 'ArrowRight');
    expect(p.onChange).toHaveBeenLastCalledWith('high');
  });

  it('reverses Left/Right in RTL', () => {
    const p = mount({ t: hebrewCompressMessages });
    key(radios()[1], 'ArrowRight');
    expect(p.onChange).toHaveBeenLastCalledWith('high');
  });

  it('description follows value', () => {
    mount({ value: 'high' });
    expect(host.querySelector('#level-picker-desc')!.textContent).toBe(englishCompressMessages.levelHighDesc);
    mount({ value: 'target' });
    expect(host.querySelector('#level-picker-desc')!.textContent).toBe(englishCompressMessages.targetDesc);
  });

  it('target panel only for target; typing and presets', () => {
    mount();
    expect(host.querySelector('#target-size-input')).toBeNull();
    const p = mount({ value: 'target' });
    const input = host.querySelector('#target-size-input') as HTMLInputElement;
    input.value = '250';
    act(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(p.onTargetKBChange).toHaveBeenCalledWith(250, { immediate: false });
    const buttons = Array.from(host.querySelectorAll('button[aria-pressed]')) as HTMLElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(['100 KB', '200 KB', '500 KB', '1 MB']);
    act(() => buttons[2].click());
    expect(p.onTargetKBChange).toHaveBeenLastCalledWith(500, { immediate: true });
  });
});

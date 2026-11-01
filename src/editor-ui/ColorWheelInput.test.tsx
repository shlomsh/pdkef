import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ColorWheelInput from './ColorWheelInput.tsx';

let host: HTMLDivElement | null = null;
afterEach(() => { const h = host; if (h) { act(() => render(null, h)); h.remove(); host = null; } });

function mount(props: Partial<Parameters<typeof ColorWheelInput>[0]> = {}) {
  const spies = { onPreview: vi.fn(), onCommit: vi.fn() };
  host = document.createElement('div');
  document.body.appendChild(host);
  const h = host;
  act(() => render(<ColorWheelInput value="#ffee00" label="Choose a color" {...spies} {...props} />, h));
  const input = h.querySelector('input[type="color"]') as HTMLInputElement;
  const fire = (type: string) => act(() => { input.dispatchEvent(new Event(type, { bubbles: true })); });
  return { ...spies, input, fire, h };
}

describe('ColorWheelInput', () => {
  it('names the native input and the wheel with the label', () => {
    const { input, h } = mount();
    expect(input.getAttribute('aria-label')).toBe('Choose a color');
    expect(h.querySelector('label')!.getAttribute('title')).toBe('Choose a color');
    expect(input.value).toBe('#ffee00');
  });

  it('previews on every input and commits once, on change', () => {
    const { input, fire, onPreview, onCommit } = mount();
    input.value = '#111111'; fire('input');
    input.value = '#222222'; fire('input');
    expect(onPreview.mock.calls).toEqual([['#111111'], ['#222222']]);
    expect(onCommit).not.toHaveBeenCalled();
    fire('change');
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('#222222');
  });

  it('a pick equal to the committed colour commits nothing and undoes the preview', () => {
    const { input, fire, onPreview, onCommit } = mount();
    input.value = '#123456'; fire('input');
    input.value = '#ffee00'; fire('input');
    fire('change');
    expect(onCommit).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenLastCalledWith('#ffee00');
  });

  it('settles a pick whose change never arrived when the input blurs, once', () => {
    const { input, fire, onCommit } = mount();
    input.value = '#abcdef'; fire('input');
    fire('blur');
    fire('change');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('marks itself pressed and forwards extra attributes', () => {
    const { h } = mount({ pressed: true, ...{ 'data-x': '1' } });
    const label = h.querySelector('label')!;
    expect(label.hasAttribute('data-pressed')).toBe(true);
    expect(label.getAttribute('data-x')).toBe('1');
  });
});

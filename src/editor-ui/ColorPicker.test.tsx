import 'preact/compat';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ColorPicker from './ColorPicker.tsx';

// Under preact/compat (every island) a JSX onChange on a colour input is the per-step `input`
// event. The picker must commit once, on the browser's real `change` (DEBT-33).
describe('ColorPicker under compat', () => {
  let host: HTMLDivElement | null = null;
  afterEach(() => { const h = host; if (h) { act(() => render(null, h)); h.remove(); host = null; } });

  it('commits once on change, never on input', () => {
    const spy = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    const h = host;
    act(() => render(<ColorPicker value="#000000" onChange={spy} />, h));
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    const fire = (type: string) => act(() => { input.dispatchEvent(new Event(type, { bubbles: true })); });
    input.value = '#111111'; fire('input');
    input.value = '#222222'; fire('input');
    expect(spy).not.toHaveBeenCalled();
    fire('change');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('#222222');
  });
});

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

  it('renders the given presets instead of the default six', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const h = host;
    act(() => render(<ColorPicker value="#ffee00" onChange={() => {}} presets={['#ffee00', '#00ff88']} />, h));
    const swatches = [...h.querySelectorAll('[data-editor-color-swatch]')].map((el) => el.getAttribute('title'));
    expect(swatches).toEqual(['#ffee00', '#00ff88']);
  });
});

describe('ColorPicker swatch names', () => {
  let host: HTMLDivElement | null = null;
  afterEach(() => { const h = host; if (h) { act(() => render(null, h)); h.remove(); host = null; } });
  const mount = (node: (h: HTMLDivElement) => any) => { host = document.createElement('div'); document.body.appendChild(host); const h = host; act(() => render(node(h), h)); return Array.from(h.querySelectorAll('[data-editor-color-swatch]')) as HTMLElement[]; };

  it('titles and labels a swatch with its name when names are given', () => {
    const [a, b] = mount(() => <ColorPicker onChange={() => {}} presets={['#ffee00', '#00ff88']} names={{ '#ffee00': 'Yellow' }} />);
    expect(a.title).toBe('Yellow');
    expect(a.getAttribute('aria-label')).toBe('Yellow');
    expect(b.title).toBe('#00ff88');
  });

  it('falls back to the hex without names', () => {
    const [a] = mount(() => <ColorPicker onChange={() => {}} presets={['#ffee00']} />);
    expect(a.getAttribute('aria-label')).toBe('#ffee00');
  });
});

describe('ColorPicker custom control', () => {
  let host: HTMLDivElement | null = null;
  afterEach(() => { const h = host; if (h) { act(() => render(null, h)); h.remove(); host = null; } });

  it('is the square input by default', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const h = host;
    act(() => render(<ColorPicker value="#000000" onChange={() => {}} />, h));
    expect(h.querySelector('[data-color-wheel]')).toBeNull();
    expect(h.querySelector('input[type="color"]')).not.toBeNull();
  });

  it("custom='wheel' renders the hue wheel, which commits once on change", () => {
    const spy = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    const h = host;
    act(() => render(<ColorPicker value="#000000" onChange={spy} custom="wheel" title="Choose a color" />, h));
    expect(h.querySelectorAll('input[type="color"]')).toHaveLength(1);
    expect(h.querySelector('[data-color-wheel]')).not.toBeNull();
    const input = h.querySelector('input[type="color"]') as HTMLInputElement;
    input.value = '#336699';
    act(() => { input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(spy).not.toHaveBeenCalled();
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(spy).toHaveBeenCalledWith('#336699');
  });

  it("custom='wheel' does not ring the wheel for a preset in another letter case (the native input reports lowercase)", () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const h = host;
    act(() => render(<ColorPicker value="#fff34d" presets={['#FFF34D']} onChange={() => {}} custom="wheel" title="Choose a color" />, h));
    expect(h.querySelector('[data-color-wheel]')?.hasAttribute('data-pressed')).toBe(false);
  });
});

import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { useNativeChange } from './useNativeChange.ts';
import { paintWhiteoutColor, renderRedactionSurface } from '../editor/registry/redactionSurface.ts';

describe('useNativeChange', () => {
  function mount(onChange: (el: HTMLInputElement) => void) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    function Probe({ cb }: { cb: (el: HTMLInputElement) => void }) {
      const ref = useRef<HTMLInputElement>(null);
      useNativeChange(ref, cb);
      return <input ref={ref} type="color" />;
    }
    act(() => render(<Probe cb={onChange} />, host));
    const input = host.querySelector('input') as HTMLInputElement;
    return { host, input, rerender: (cb: (el: HTMLInputElement) => void) => act(() => render(<Probe cb={cb} />, host)) };
  }

  it('fires on change only, never on input', () => {
    const onChange = vi.fn();
    const { host, input } = mount(onChange);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(input);
    act(() => render(null, host));
    host.remove();
  });

  it('calls the latest callback after a re-render, and detaches on unmount', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { host, input, rerender } = mount(first);
    rerender(latest);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    act(() => render(null, host));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(latest).toHaveBeenCalledTimes(1);
    host.remove();
  });
});

describe('paintWhiteoutColor', () => {
  function box(id: string, child: HTMLElement | SVGElement) {
    const el = document.createElement('div');
    el.dataset.redactBoxId = id;
    el.appendChild(child);
    return el;
  }

  it('repaints a whiteout box fill in place', () => {
    const root = document.createElement('div');
    const surface = document.createElement('div');
    render(renderRedactionSurface('whiteout', '#ffffff'), surface);
    root.append(box('a', surface.firstElementChild as HTMLElement), box('b', document.createElement('div')));
    expect(paintWhiteoutColor(root, 'a', '#123456')).toBe(true);
    expect((root.querySelector('.redact-surface--whiteout') as HTMLElement).style.backgroundColor).toBe('rgb(18, 52, 86)');
  });

  it('repaints a whiteout stroke line, and reports a box it cannot find', () => {
    const root = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'redact-surface redact-surface--whiteoutStroke');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke', '#ffffff');
    svg.appendChild(path);
    root.append(box('s', svg));
    expect(paintWhiteoutColor(root, 's', '#abcdef')).toBe(true);
    expect(path.getAttribute('stroke')).toBe('#abcdef');
    expect(paintWhiteoutColor(root, 'missing', '#abcdef')).toBe(false);
  });
});

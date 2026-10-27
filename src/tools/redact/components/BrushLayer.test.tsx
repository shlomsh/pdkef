import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BrushLayer from './BrushLayer.tsx';

const RECT = { left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON() {} } as DOMRect;

describe('BrushLayer', () => {
  const host = document.createElement('div');
  afterEach(() => act(() => render(null, host)));

  function mount(onCommit = vi.fn()) {
    document.body.appendChild(host);
    act(() => render(<BrushLayer pageIndex={2} kind="whiteout" sizePt={10} color="#ecebe6" pageHeightPt={792} onCommit={onCommit} />, host));
    const layer = host.querySelector<HTMLElement>('[data-brush-layer]')!;
    layer.getBoundingClientRect = () => RECT;
    return { layer, onCommit };
  }

  it('paints in the DOM and commits one simplified element on release', () => {
    const { layer, onCommit } = mount();
    layer.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    for (let i = 1; i <= 50; i += 1) window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + i * 0.05, clientY: 100 }));
    expect(host.querySelector('path')!.getAttribute('d')).toContain('L');
    expect(onCommit).not.toHaveBeenCalled();
    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(onCommit).toHaveBeenCalledTimes(1);
    const stroke = onCommit.mock.calls[0][0];
    expect(stroke.type).toBe('whiteoutStroke');
    expect(stroke.pageIndex).toBe(2);
    expect(stroke.color).toBe('#ecebe6');
    expect(stroke.points.length).toBeLessThan(10);
    expect(host.querySelector('path')!.getAttribute('d')).toBeNull();
  });

  it('a second finger cancels the stroke', () => {
    const { layer, onCommit } = mount();
    layer.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    const two = new TouchEvent('touchmove', {
      touches: [{ identifier: 1, target: layer, clientX: 100, clientY: 100 }, { identifier: 2, target: layer, clientX: 200, clientY: 200 }] as never,
    });
    window.dispatchEvent(two);
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(onCommit).not.toHaveBeenCalled();
  });
});

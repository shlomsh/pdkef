// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { usePinchZoom } from './usePinchZoom.ts';
import { ZOOM_MAX } from '../lib/zoom/fit.ts';

function Harness(props: Parameters<typeof usePinchZoom>[0]) {
  usePinchZoom(props);
  return null;
}

describe('usePinchZoom', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('leaves no preview transform behind when a pinch at the zoom bound commits nothing', () => {
    const ws = document.createElement('div');
    const col = document.createElement('div');
    document.body.append(ws, col);
    const commit = vi.fn();
    const root = document.createElement('div');
    act(() => render(<Harness workspaceRef={{ current: ws }} columnRef={{ current: col }} enabled inLamp zoomRef={{ current: ZOOM_MAX }} commit={commit} />, root));
    ws.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -50, clientX: 10, clientY: 10, cancelable: true }));
    expect(col.style.transform).toBe('scale(1)');
    vi.advanceTimersByTime(200);
    expect(col.style.transform).toBe('');
    expect(col.style.transformOrigin).toBe('');
    expect(commit).not.toHaveBeenCalled();
  });
});

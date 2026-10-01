import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleCanvasColor, sampleRingColor, useEyedropper } from './pageSampling.ts';

function stubCanvas(pixel: [number, number, number]) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 400;
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 200, right: 110, bottom: 220, x: 10, y: 20, toJSON() {} }) as DOMRect;
  const getImageData = vi.fn(() => ({ data: new Uint8ClampedArray([...pixel, 255]) }));
  canvas.getContext = (() => ({ getImageData })) as never;
  return { canvas, getImageData };
}

describe('sampleRingColor', () => {
  function ringCanvas(getImageData: (...a: number[]) => unknown, width = 300, height = 150, cssWidth = 100) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getBoundingClientRect = () => ({ width: cssWidth, height: 50 }) as DOMRect;
    canvas.getContext = (() => ({ getImageData })) as never;
    return canvas;
  }
  const solid = (r: number, g: number, b: number) => ({ data: new Uint8ClampedArray([r, g, b, 255]) });

  it('reads the four ring strips around a centred box and returns their median', () => {
    const getImageData = vi.fn(() => solid(200, 210, 220));
    const canvas = ringCanvas(getImageData);
    // 300x150 backing, 100 css px wide: thickness 12. Box 40%-60% x 40%-60%.
    expect(sampleRingColor(canvas, { left: 40, top: 40, width: 20, height: 20 })).toBe('#c8d2dc');
    expect(getImageData.mock.calls).toEqual([
      [108, 48, 84, 12],
      [108, 90, 84, 12],
      [108, 60, 12, 30],
      [180, 60, 12, 30],
    ]);
  });

  it('reads the interior once when the box covers the page', () => {
    const getImageData = vi.fn(() => solid(1, 2, 3));
    const canvas = ringCanvas(getImageData);
    expect(sampleRingColor(canvas, { left: 0, top: 0, width: 100, height: 100 })).toBe('#010203');
    expect(getImageData.mock.calls).toEqual([[0, 0, 300, 150]]);
  });

  it('gives null when reading throws, there is no canvas or it has no size', () => {
    const box = { left: 40, top: 40, width: 20, height: 20 };
    expect(sampleRingColor(ringCanvas(() => { throw new Error('tainted'); }), box)).toBeNull();
    expect(sampleRingColor(null, box)).toBeNull();
    expect(sampleRingColor(undefined, box)).toBeNull();
    expect(sampleRingColor(ringCanvas(() => solid(1, 2, 3), 0, 150), box)).toBeNull();
  });

  it('gives null when the page is unpainted', () => {
    const canvas = ringCanvas(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) }));
    expect(sampleRingColor(canvas, { left: 40, top: 40, width: 20, height: 20 })).toBeNull();
  });
});

describe('eyedropper', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('samples the canvas pixel under the pointer as a hex colour', () => {
    const { canvas, getImageData } = stubCanvas([236, 235, 230]);
    expect(sampleCanvasColor(canvas, 60, 120)).toBe('#ecebe6');
    expect(getImageData).toHaveBeenCalledWith(100, 200, 1, 1);
  });

  function mountDropper() {
    const { canvas } = stubCanvas([1, 2, 3]);
    const card = document.createElement('div');
    card.setAttribute('data-editor-page-card', '');
    card.appendChild(canvas);
    document.body.appendChild(card);
    const onPick = vi.fn();
    const onDone = vi.fn();
    const pageHandler = vi.fn();
    card.addEventListener('mousedown', pageHandler);
    const host = document.createElement('div');
    function Host() { useEyedropper(true, onPick, onDone); return null; }
    act(() => render(<Host />, host));
    const cleanup = () => { act(() => render(null, host)); card.remove(); };
    return { canvas, onPick, onDone, pageHandler, cleanup };
  }

  it('the next press on a page sets the colour and is not a stroke', () => {
    const { canvas, onPick, onDone, pageHandler, cleanup } = mountDropper();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalledWith('#010203');
    expect(onDone).toHaveBeenCalled();
    expect(pageHandler).not.toHaveBeenCalled();
    cleanup();
  });

  it('swallows the click that follows a mouse pick, but only briefly', () => {
    vi.useFakeTimers();
    const { canvas, cleanup } = mountDropper();
    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(docClick).not.toHaveBeenCalled();

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(601);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(docClick).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', docClick);
    cleanup();
  });
});

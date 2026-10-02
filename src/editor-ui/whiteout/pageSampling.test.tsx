import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  function pageCard(canvas: HTMLCanvasElement) {
    const card = document.createElement('div');
    card.setAttribute('data-editor-page-card', '');
    const area = document.createElement('div');
    area.className = 'redact-draw-area';
    area.appendChild(canvas);
    card.appendChild(area);
    document.body.appendChild(card);
    return { card, area };
  }

  function mountDropper() {
    const { canvas } = stubCanvas([1, 2, 3]);
    const { card, area } = pageCard(canvas);
    const onPick = vi.fn();
    const onDone = vi.fn();
    const pageHandler = vi.fn();
    card.addEventListener('mousedown', pageHandler);
    const host = document.createElement('div');
    function Host() { useEyedropper(true, onPick, onDone, '.redact-draw-area'); return null; }
    act(() => render(<Host />, host));
    const cleanup = () => { act(() => render(null, host)); card.remove(); };
    return { canvas, card, area, onPick, onDone, pageHandler, cleanup };
  }

  it('the next press on a page sets the colour and is not a stroke', () => {
    const { canvas, onPick, onDone, pageHandler, cleanup } = mountDropper();
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalledWith('#010203');
    expect(onDone).toHaveBeenCalled();
    expect(pageHandler).not.toHaveBeenCalled();
    cleanup();
  });

  it('swallows the click that follows a mouse pick, but not one after its mouseup', () => {
    vi.useFakeTimers();
    const { canvas, cleanup } = mountDropper();
    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(docClick).not.toHaveBeenCalled();

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(1);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(docClick).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', docClick);
    cleanup();
  });

  it('a long press still swallows its own click', () => {
    vi.useFakeTimers();
    const { canvas, cleanup } = mountDropper();
    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(900);
    canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(docClick).not.toHaveBeenCalled();
    document.removeEventListener('click', docClick);
    cleanup();
  });

  it('a right-button press neither picks nor arms a swallow', () => {
    const { canvas, onPick, onDone, cleanup } = mountDropper();
    const docClick = vi.fn();
    document.addEventListener('click', docClick);
    const down = new MouseEvent('mousedown', { button: 2, clientX: 60, clientY: 120, bubbles: true, cancelable: true });
    canvas.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(docClick).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', docClick);
    cleanup();
  });

  describe('chrome inside the page is left alone', () => {
    function chromeCase(where: 'actions' | 'resizer' | 'header') {
      const m = mountDropper();
      const holder = document.createElement('div');
      if (where === 'actions') holder.setAttribute('data-editor-actions', '');
      if (where === 'resizer') holder.setAttribute('data-editor-resizer', '');
      const button = document.createElement('button');
      holder.appendChild(button);
      if (where === 'header') m.card.insertBefore(holder, m.area);
      else m.area.appendChild(holder);
      const onClick = vi.fn();
      button.addEventListener('click', onClick);
      return { ...m, button, onClick };
    }

    for (const where of ['actions', 'resizer', 'header'] as const) {
      it(`a press on a ${where} button is not a pick and its click arrives`, () => {
        const { button, onClick, onPick, onDone, cleanup } = chromeCase(where);
        const down = new MouseEvent('mousedown', { clientX: 60, clientY: 120, bubbles: true, cancelable: true });
        button.dispatchEvent(down);
        button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(down.defaultPrevented).toBe(false);
        expect(onPick).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        expect(onClick).toHaveBeenCalledTimes(1);
        cleanup();
      });
    }
  });

  describe('loupe', () => {
    let frames: Array<() => void> = [];
    const flush = () => { const f = frames; frames = []; f.forEach((cb) => cb()); };
    const loupeEl = () => document.querySelector<HTMLElement>('[data-redact-eyedropper-loupe]');
    const hexText = () => loupeEl()?.querySelector('[data-loupe-hex]')?.textContent;
    const touchEvent = (type: string, touches: Array<{ id: number; x: number; y: number }>, changed = touches) => {
      const mk = (t: { id: number; x: number; y: number }) => ({ identifier: t.id, clientX: t.x, clientY: t.y });
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { touches: touches.map(mk), changedTouches: changed.map(mk) });
      return e;
    };

    beforeEach(() => {
      frames = [];
      vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb));
      vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it('follows the mouse over a page with a translate and the hex, and hides off the page', () => {
      const { canvas, cleanup } = mountDropper();
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      flush();
      expect(loupeEl()?.style.transform).toBe('translate(0px, 60px)');
      expect(loupeEl()?.style.display).not.toBe('none');
      expect(hexText()).toBe('#010203');
      expect(document.documentElement.hasAttribute('data-redact-eyedropping')).toBe(true);
      document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      expect(loupeEl()?.style.display).toBe('none');
      cleanup();
    });

    it('the loupe lives in the pseudo full screen element, else in body', () => {
      const host = document.createElement('div');
      host.setAttribute('data-pseudo-fullscreen', '');
      document.body.appendChild(host);
      const a = mountDropper();
      a.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      flush();
      expect(loupeEl()?.parentElement).toBe(host);
      a.cleanup();
      host.remove();
      const b = mountDropper();
      b.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      flush();
      expect(loupeEl()?.parentElement).toBe(document.body);
      b.cleanup();
    });

    it('hovering the selected box pill hides the loupe', () => {
      const { canvas, area, cleanup } = mountDropper();
      const pill = document.createElement('div');
      pill.setAttribute('data-editor-actions', '');
      const button = document.createElement('button');
      pill.appendChild(button);
      area.appendChild(pill);
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      flush();
      expect(loupeEl()?.style.display).not.toBe('none');
      button.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      expect(loupeEl()?.style.display).toBe('none');
      cleanup();
    });

    it('touch shows the loupe without picking, follows the slide, and picks on lift', () => {
      const { canvas, onPick, onDone, cleanup } = mountDropper();
      const start = touchEvent('touchstart', [{ id: 1, x: 60, y: 120 }]);
      canvas.dispatchEvent(start);
      flush();
      expect(start.defaultPrevented).toBe(true);
      expect(onPick).not.toHaveBeenCalled();
      expect(loupeEl()?.style.display).not.toBe('none');
      const before = loupeEl()?.style.transform;
      canvas.dispatchEvent(touchEvent('touchmove', [{ id: 1, x: 80, y: 140 }]));
      flush();
      expect(loupeEl()?.style.transform).not.toBe(before);
      expect(onPick).not.toHaveBeenCalled();
      canvas.dispatchEvent(touchEvent('touchend', [], [{ id: 1, x: 80, y: 140 }]));
      expect(onPick).toHaveBeenCalledWith('#010203');
      expect(onDone).toHaveBeenCalled();
      expect(loupeEl()?.style.display).toBe('none');
      cleanup();
    });

    it('a re-render with new callbacks mid-touch keeps the loupe and the gesture, and uses the latest callbacks', () => {
      const { canvas } = stubCanvas([9, 8, 7]);
      const { card } = pageCard(canvas);
      const host = document.createElement('div');
      const first = { pick: vi.fn(), done: vi.fn() };
      const latest = { pick: vi.fn(), done: vi.fn() };
      function Host({ cb }: { cb: typeof first }) { useEyedropper(true, (c) => cb.pick(c), () => cb.done(), '.redact-draw-area'); return null; }
      act(() => render(<Host cb={first} />, host));
      canvas.dispatchEvent(touchEvent('touchstart', [{ id: 1, x: 60, y: 120 }]));
      flush();
      const el = loupeEl();
      expect(el).not.toBeNull();
      act(() => render(<Host cb={latest} />, host));
      expect(loupeEl()).toBe(el);
      canvas.dispatchEvent(touchEvent('touchmove', [{ id: 1, x: 80, y: 140 }]));
      flush();
      act(() => render(<Host cb={latest} />, host));
      expect(loupeEl()).toBe(el);
      canvas.dispatchEvent(touchEvent('touchend', [], [{ id: 1, x: 80, y: 140 }]));
      expect(latest.pick).toHaveBeenCalledWith('#090807');
      expect(latest.done).toHaveBeenCalledTimes(1);
      expect(first.pick).not.toHaveBeenCalled();
      expect(first.done).not.toHaveBeenCalled();
      act(() => render(null, host));
      card.remove();
    });

    it('a second finger aborts without picking and stays armed', () => {
      const { canvas, onPick, onDone, cleanup } = mountDropper();
      canvas.dispatchEvent(touchEvent('touchstart', [{ id: 1, x: 60, y: 120 }]));
      flush();
      canvas.dispatchEvent(touchEvent('touchstart', [{ id: 1, x: 60, y: 120 }, { id: 2, x: 70, y: 130 }], [{ id: 2, x: 70, y: 130 }]));
      expect(loupeEl()?.style.display).toBe('none');
      canvas.dispatchEvent(touchEvent('touchend', [], [{ id: 1, x: 60, y: 120 }]));
      expect(onPick).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      expect(loupeEl()).not.toBeNull();
      cleanup();
    });

    it('removes the loupe and the html attribute when deactivated', () => {
      const { canvas, cleanup } = mountDropper();
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      cleanup();
      expect(loupeEl()).toBeNull();
      expect(document.documentElement.hasAttribute('data-redact-eyedropping')).toBe(false);
    });
  });
});

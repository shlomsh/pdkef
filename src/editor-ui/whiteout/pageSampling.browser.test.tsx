import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleCanvasColor, sampleRingColor, useEyedropper } from './pageSampling.ts';

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const nextFrame = () => new Promise<void>((done) => { requestAnimationFrame(() => done()); });

function paint(canvas: HTMLCanvasElement, background: string, marks: Array<[number, number, number, number, string]>) {
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [x, y, w, h, color] of marks) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

function stubCanvas(pixel: [number, number, number]) {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 400;
  canvas.style.cssText = 'display:block;width:100px;height:200px';
  paint(canvas, 'rgb(250,0,0)', [
    [100, 200, 1, 1, rgb(pixel)],
    [140, 240, 1, 1, rgb(pixel)],
  ]);
  const getImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
  return { canvas, getImageData };
}

describe('sampleRingColor', () => {
  function ringCanvas(width = 300, height = 150, cssWidth = 100) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.cssText = `display:block;width:${cssWidth}px;height:50px`;
    document.body.appendChild(canvas);
    mounted.push(canvas);
    return canvas;
  }

  it('reads the four ring strips around a centred box and returns their median', () => {
    const canvas = ringCanvas();
    const ring = 'rgb(200,210,220)';
    paint(canvas, 'rgb(250,0,0)', [
      [108, 48, 84, 12, ring],
      [108, 90, 84, 12, ring],
      [108, 60, 12, 30, ring],
      [180, 60, 12, 30, ring],
    ]);
    const getImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
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
    const canvas = ringCanvas();
    paint(canvas, 'rgb(1,2,3)', []);
    const getImageData = vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData');
    expect(sampleRingColor(canvas, { left: 0, top: 0, width: 100, height: 100 })).toBe('#010203');
    expect(getImageData.mock.calls).toEqual([[0, 0, 300, 150]]);
  });

  it('gives null when reading throws, there is no canvas or it has no size', () => {
    const box = { left: 40, top: 40, width: 20, height: 20 };
    const tainted = ringCanvas();
    paint(tainted, 'rgb(1,2,3)', []);
    // forced: a tainted canvas, which makes getImageData throw
    vi.spyOn(CanvasRenderingContext2D.prototype, 'getImageData').mockImplementation(() => { throw new Error('tainted'); });
    expect(sampleRingColor(tainted, box)).toBeNull();
    vi.restoreAllMocks();
    expect(sampleRingColor(null, box)).toBeNull();
    expect(sampleRingColor(undefined, box)).toBeNull();
    expect(sampleRingColor(ringCanvas(0, 150), box)).toBeNull();
  });

  it('gives null when the page is unpainted', () => {
    const canvas = ringCanvas();
    expect(sampleRingColor(canvas, { left: 40, top: 40, width: 20, height: 20 })).toBeNull();
  });
});

describe('eyedropper', () => {
  it('samples the canvas pixel under the pointer as a hex colour', () => {
    const { canvas, getImageData } = stubCanvas([236, 235, 230]);
    pageCard(canvas);
    expect(sampleCanvasColor(canvas, 60, 120)).toBe('#ecebe6');
    expect(getImageData).toHaveBeenCalledWith(100, 200, 1, 1);
  });

  function pageCard(canvas: HTMLCanvasElement) {
    const card = document.createElement('div');
    card.setAttribute('data-editor-page-card', '');
    card.style.cssText = 'position:fixed;left:0;top:0;margin:0';
    const area = document.createElement('div');
    area.className = 'redact-draw-area';
    area.style.cssText = 'position:absolute;left:10px;top:20px';
    area.appendChild(canvas);
    card.appendChild(area);
    document.body.appendChild(card);
    mounted.push(card);
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
    const loupeEl = () => document.querySelector<HTMLElement>('[data-eyedropper-loupe]');
    const hexText = () => loupeEl()?.querySelector('[data-loupe-hex]')?.textContent;
    const touchEvent = (type: string, target: Element, touches: Array<{ id: number; x: number; y: number }>, changed = touches) => {
      const mk = (t: { id: number; x: number; y: number }) => new Touch({ identifier: t.id, target, clientX: t.x, clientY: t.y });
      return new TouchEvent(type, { bubbles: true, cancelable: true, touches: touches.map(mk), changedTouches: changed.map(mk) });
    };

    it('follows the mouse over a page with a translate and the hex, and hides off the page', async () => {
      const { canvas, cleanup } = mountDropper();
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      await nextFrame();
      expect(loupeEl()?.style.transform).toBe('translate(0px, 60px)');
      expect(loupeEl()?.style.display).not.toBe('none');
      expect(hexText()).toBe('#010203');
      expect(document.documentElement.hasAttribute('data-eyedropping')).toBe(true);
      document.body.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
      expect(loupeEl()?.style.display).toBe('none');
      cleanup();
    });

    it('the loupe lives in the pseudo full screen element, else in body', async () => {
      const host = document.createElement('div');
      host.setAttribute('data-pseudo-fullscreen', '');
      document.body.appendChild(host);
      mounted.push(host);
      const a = mountDropper();
      a.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      await nextFrame();
      expect(loupeEl()?.parentElement).toBe(host);
      a.cleanup();
      host.remove();
      const b = mountDropper();
      b.canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      await nextFrame();
      expect(loupeEl()?.parentElement).toBe(document.body);
      b.cleanup();
    });

    it('hovering the selected box pill hides the loupe', async () => {
      const { canvas, area, cleanup } = mountDropper();
      const pill = document.createElement('div');
      pill.setAttribute('data-editor-actions', '');
      const button = document.createElement('button');
      pill.appendChild(button);
      area.appendChild(pill);
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      await nextFrame();
      expect(loupeEl()?.style.display).not.toBe('none');
      button.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 120, bubbles: true }));
      expect(loupeEl()?.style.display).toBe('none');
      cleanup();
    });

    it('touch shows the loupe without picking, follows the slide, and picks on lift', async () => {
      const { canvas, onPick, onDone, cleanup } = mountDropper();
      const start = touchEvent('touchstart', canvas, [{ id: 1, x: 60, y: 120 }]);
      canvas.dispatchEvent(start);
      await nextFrame();
      expect(start.defaultPrevented).toBe(true);
      expect(onPick).not.toHaveBeenCalled();
      expect(loupeEl()?.style.display).not.toBe('none');
      const before = loupeEl()?.style.transform;
      canvas.dispatchEvent(touchEvent('touchmove', canvas, [{ id: 1, x: 80, y: 140 }]));
      await nextFrame();
      expect(loupeEl()?.style.transform).not.toBe(before);
      expect(onPick).not.toHaveBeenCalled();
      canvas.dispatchEvent(touchEvent('touchend', canvas, [], [{ id: 1, x: 80, y: 140 }]));
      expect(onPick).toHaveBeenCalledWith('#010203');
      expect(onDone).toHaveBeenCalled();
      expect(loupeEl()?.style.display).toBe('none');
      cleanup();
    });

    it('a re-render with new callbacks mid-touch keeps the loupe and the gesture, and uses the latest callbacks', async () => {
      const { canvas } = stubCanvas([9, 8, 7]);
      const { card } = pageCard(canvas);
      const host = document.createElement('div');
      const first = { pick: vi.fn(), done: vi.fn() };
      const latest = { pick: vi.fn(), done: vi.fn() };
      function Host({ cb }: { cb: typeof first }) { useEyedropper(true, (c) => cb.pick(c), () => cb.done(), '.redact-draw-area'); return null; }
      act(() => render(<Host cb={first} />, host));
      canvas.dispatchEvent(touchEvent('touchstart', canvas, [{ id: 1, x: 60, y: 120 }]));
      await nextFrame();
      const el = loupeEl();
      expect(el).not.toBeNull();
      act(() => render(<Host cb={latest} />, host));
      expect(loupeEl()).toBe(el);
      canvas.dispatchEvent(touchEvent('touchmove', canvas, [{ id: 1, x: 80, y: 140 }]));
      await nextFrame();
      act(() => render(<Host cb={latest} />, host));
      expect(loupeEl()).toBe(el);
      canvas.dispatchEvent(touchEvent('touchend', canvas, [], [{ id: 1, x: 80, y: 140 }]));
      expect(latest.pick).toHaveBeenCalledWith('#090807');
      expect(latest.done).toHaveBeenCalledTimes(1);
      expect(first.pick).not.toHaveBeenCalled();
      expect(first.done).not.toHaveBeenCalled();
      act(() => render(null, host));
      card.remove();
    });

    it('a second finger aborts without picking and stays armed', async () => {
      const { canvas, onPick, onDone, cleanup } = mountDropper();
      canvas.dispatchEvent(touchEvent('touchstart', canvas, [{ id: 1, x: 60, y: 120 }]));
      await nextFrame();
      canvas.dispatchEvent(touchEvent('touchstart', canvas, [{ id: 1, x: 60, y: 120 }, { id: 2, x: 70, y: 130 }], [{ id: 2, x: 70, y: 130 }]));
      expect(loupeEl()?.style.display).toBe('none');
      canvas.dispatchEvent(touchEvent('touchend', canvas, [], [{ id: 1, x: 60, y: 120 }]));
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
      expect(document.documentElement.hasAttribute('data-eyedropping')).toBe(false);
    });
  });
});

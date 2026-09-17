// MOBI-12: on a phone every handle has a 44px halo, and a short text box's
// side handle (rendered last) covers both corner dots on its edge. The press
// is routed to the handle nearest the touch, whichever node the browser hit.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import ElementResizers from './ElementResizers.tsx';

// A 100x20 box at (100, 100): the side handle's 46px halo spans y 87-133 and
// hides both right-hand corner dots (centred at y 100 and y 120).
const HANDLE_CENTRES: Record<string, { x: number; y: number }> = {
  'top-left': { x: 100, y: 100 },
  'top-right': { x: 200, y: 100 },
  'bottom-left': { x: 100, y: 120 },
  'bottom-right': { x: 200, y: 120 },
  left: { x: 100, y: 110 },
  right: { x: 200, y: 110 },
};

describe('ElementResizers routes a press to the nearest handle', () => {
  let container: HTMLDivElement | null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container as any));
      container.remove();
      container = null;
    }
  });

  function mount() {
    const onResizeStart = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <ElementResizers
          element={{ id: 't1', type: 'text', pageIndex: 0, left: 10, top: 10, text: '18/09/2026' } as any}
          isActive
          onResizeStart={onResizeStart}
        />,
        container as any,
      );
    });
    container.querySelectorAll<HTMLElement>('[data-editor-resizer]').forEach((node) => {
      const centre = HANDLE_CENTRES[node.dataset.editorResizer as string];
      node.getBoundingClientRect = () => ({
        left: centre.x - 5, top: centre.y - 5, width: 10, height: 10,
        right: centre.x + 5, bottom: centre.y + 5, x: centre.x - 5, y: centre.y - 5, toJSON() {},
      }) as DOMRect;
    });
    return { onResizeStart };
  }

  function press(handle: string, at: { x: number; y: number }, touch = false) {
    const node = (container as HTMLDivElement).querySelector(`[data-editor-resizer="${handle}"]`) as HTMLElement;
    act(() => {
      if (touch) {
        const event = new Event('touchstart', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: [{ clientX: at.x, clientY: at.y }] });
        node.dispatchEvent(event);
      } else {
        node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y }));
      }
    });
  }

  it('starts a corner resize when the side handle catches a touch at the corner', () => {
    const { onResizeStart } = mount();
    press('right', { x: 203, y: 124 }, true);
    expect(onResizeStart).toHaveBeenCalledTimes(1);
    expect(onResizeStart.mock.calls[0][1]).toBe('bottom-right');
  });

  it('keeps the span resize for a touch at mid-edge', () => {
    const { onResizeStart } = mount();
    press('right', { x: 205, y: 109 }, true);
    expect(onResizeStart.mock.calls[0][1]).toBe('right');
  });

  it('routes a mouse press the same way', () => {
    const { onResizeStart } = mount();
    press('right', { x: 199, y: 101 });
    expect(onResizeStart.mock.calls[0][1]).toBe('top-right');
  });

  it('falls back to the pressed handle when nothing has layout', () => {
    const { onResizeStart } = mount();
    (container as HTMLDivElement).querySelectorAll<HTMLElement>('[data-editor-resizer]').forEach((node) => {
      node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
    });
    press('right', { x: 203, y: 124 }, true);
    expect(onResizeStart.mock.calls[0][1]).toBe('right');
  });
});

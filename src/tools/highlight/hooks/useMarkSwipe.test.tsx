import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarkSwipe } from './useMarkSwipe.ts';

vi.mock('#editor-ui/highlight/highlightSwipeGesture.ts', () => ({ startHighlightSwipe: vi.fn() }));

let container: HTMLElement | null = null;
let handler: (event: PointerEvent) => void;
const dispatch = vi.fn();
const onPress = vi.fn();

function Probe() {
  handler = useMarkSwipe({
    pageIndex: 0, geometry: undefined, elements: [],
    marker: { color: 'yellow', style: 'highlight', opacity: 1 } as never,
    touchArmed: false,
    getPointerPercent: (e: MouseEvent | TouchEvent) => ({ x: (e as MouseEvent).clientX / 10, y: (e as MouseEvent).clientY / 10 }),
    directionAt: () => 'ltr' as never,
    dispatch, logAction: vi.fn(), setAnnouncement: vi.fn(),
    clicks: { beginPress: vi.fn(), inkStarted: vi.fn(), noteSwipeAction: vi.fn() } as never,
    onPress, onInk: vi.fn(),
  });
  return null;
}

function mount() {
  container = document.createElement('div');
  act(() => render(<Probe />, container!));
}

function press(x = 100, y = 100) {
  const target = document.createElement('div');
  handler({ button: 0, pointerType: 'mouse', clientX: x, clientY: y, target, currentTarget: target } as unknown as PointerEvent);
}

const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  dispatch.mockClear(); onPress.mockClear(); vi.restoreAllMocks();
});

describe('useMarkSwipe threshold', () => {
  it('a press and release with no movement dispatches nothing', () => {
    mount(); press();
    window.dispatchEvent(new MouseEvent('mouseup'));
    move(150, 150);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a 2 px move then release dispatches nothing', () => {
    mount(); press();
    move(102, 100);
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a 6 px move adds the element once, at the press point', () => {
    mount(); press();
    move(106, 100);
    move(130, 100);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT', payload: { left: 10, top: 10 } });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('unmount before the threshold removes the window listeners', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    mount(); press();
    const added = add.mock.calls.map((c) => c[0]);
    expect(added).toContain('mousemove');
    act(() => render(null, container!));
    for (const type of added) expect(remove.mock.calls.map((c) => c[0])).toContain(type);
    move(200, 200);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

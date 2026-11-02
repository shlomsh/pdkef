import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHighlightSwipe } from '#editor-ui/highlight/highlightSwipeGesture.ts';
import { useMarkSwipe } from './useMarkSwipe.ts';

vi.mock('#editor-ui/highlight/highlightSwipeGesture.ts', () => ({ startHighlightSwipe: vi.fn() }));

let container: HTMLElement | null = null;
let handler: (event: PointerEvent) => void;
const dispatch = vi.fn();
const onPress = vi.fn();
const logAction = vi.fn();
const setAnnouncement = vi.fn();
let armed = true;
let readerAt: ((point: { x: number; y: number }) => Reader | null) | undefined;
type Reader = { onLine: (point: { x: number; y: number }) => boolean };
const readerOf = (on: boolean): Reader => ({ onLine: () => on });

function Probe() {
  handler = useMarkSwipe({
    pageIndex: 0, geometry: undefined, elements: [],
    marker: { color: 'yellow', style: 'highlight', opacity: 1 } as never,
    armed,
    getPointerPercent: (e: MouseEvent | TouchEvent) => ({ x: (e as MouseEvent).clientX / 10, y: (e as MouseEvent).clientY / 10 }),
    directionAt: () => 'ltr' as never,
    dispatch, logAction, setAnnouncement,
    clicks: { beginPress: vi.fn(), inkStarted: vi.fn(), noteSwipeAction: vi.fn() } as never,
    onPress, onInk: vi.fn(), readerAt: readerAt as never,
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

function pressTouch(x = 100, y = 100) {
  const workspace = document.createElement('div');
  workspace.setAttribute('data-workspace', '');
  workspace.scrollLeft = 50;
  const target = document.createElement('div');
  workspace.append(target);
  handler({ button: 0, pointerType: 'touch', clientX: x, clientY: y, target, currentTarget: target } as unknown as PointerEvent);
  return workspace;
}

const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));

afterEach(() => {
  readerAt = undefined;
  armed = true;
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  dispatch.mockClear(); onPress.mockClear(); logAction.mockClear(); setAnnouncement.mockClear(); vi.restoreAllMocks();
});

describe('useMarkSwipe second finger', () => {
  it('a non-primary touch pointer never marks and never begins a press', () => {
    mount();
    const target = document.createElement('div');
    handler({ button: 0, pointerType: 'touch', isPrimary: false, clientX: 100, clientY: 100, target, currentTarget: target } as unknown as PointerEvent);
    move(150, 100);
    window.dispatchEvent(new TouchEvent('touchmove', { touches: [{ clientX: 150, clientY: 100 } as Touch] }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('useMarkSwipe threshold', () => {
  it('a mouse drag lays a mark while armed and none once the marker is put down', () => {
    mount(); press(); move(150, 150);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_ELEMENT' }));
    dispatch.mockClear(); onPress.mockClear();
    window.dispatchEvent(new MouseEvent('mouseup'));
    armed = false; act(() => render(null, container!)); mount(); press(); move(150, 150);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

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

describe('useMarkSwipe touch intent', () => {
  it('a touch press moving 30 px down lays no element and leaves the scroll to the browser', () => {
    mount(); pressTouch();
    move(100, 130);
    move(130, 130);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a touch press moving 30 px sideways lays an element', () => {
    mount(); pressTouch();
    move(130, 100);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
  });
});

describe('useMarkSwipe two fingers', () => {
  const finger = (x: number, y: number) => ({ clientX: x, clientY: y });
  const touch = (type: string, touches: Array<{ clientX: number; clientY: number }>) =>
    window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { touches }));

  it('a second finger while the swipe is pending lays nothing, even once the first drifts sideways', () => {
    mount(); pressTouch();
    touch('touchstart', [finger(100, 100), finger(200, 100)]);
    touch('touchmove', [finger(130, 100), finger(200, 100)]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('a second finger moving while the swipe is pending lays nothing', () => {
    mount(); pressTouch();
    touch('touchmove', [finger(130, 100), finger(200, 100)]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a second finger after the mark began cancels it: the element goes, no history, no announcement', () => {
    vi.mocked(startHighlightSwipe).mockImplementationOnce((deps, target) => {
      deps.gestureCancelRef.current = () => {
        deps.gestureCancelRef.current = null;
        deps.dispatch({ type: 'DELETE_ELEMENT', payload: target.id } as never);
      };
    });
    mount(); pressTouch();
    move(130, 100);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
    touch('touchstart', [finger(130, 100), finger(250, 100)]);
    expect(dispatch.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'DELETE_ELEMENT' });
    expect(logAction).not.toHaveBeenCalled();
    expect(setAnnouncement).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some((c) => c[0].type === 'ADD_ACTION_HISTORY')).toBe(false);
  });
});

describe('useMarkSwipe off the text', () => {
  const finger = (x: number, y: number) => ({ clientX: x, clientY: y });
  const touch = (type: string, touches: Array<{ clientX: number; clientY: number }>) =>
    window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { touches }));

  it('a sideways start off a line lays nothing and moves the page sideways with the finger', () => {
    readerAt = () => readerOf(false);
    mount(); const workspace = pressTouch();
    touch('touchmove', [finger(130, 100)]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
    expect(workspace.scrollLeft).toBe(20);
    touch('touchmove', [finger(90, 160)]);
    expect(workspace.scrollLeft).toBe(60);
  });

  it('stops moving the page when the finger lifts or a second finger lands', () => {
    readerAt = () => readerOf(false);
    mount(); const workspace = pressTouch();
    touch('touchstart', [finger(100, 100), finger(200, 100)]);
    touch('touchmove', [finger(130, 100)]);
    expect(workspace.scrollLeft).toBe(50);
    const lifted = pressTouch();
    touch('touchend', []);
    touch('touchmove', [finger(130, 100)]);
    expect(lifted.scrollLeft).toBe(50);
  });

  it('a sideways start on a line marks as before and leaves the page', () => {
    readerAt = () => readerOf(true);
    mount(); const workspace = pressTouch();
    touch('touchmove', [finger(130, 100)]);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
    expect(workspace.scrollLeft).toBe(50);
  });

  it('without a reader a sideways start marks, as before', () => {
    mount(); pressTouch();
    touch('touchmove', [finger(130, 100)]);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
  });

  it('no canvas to read (a null reader) counts as on a line', () => {
    readerAt = () => null;
    mount(); pressTouch();
    touch('touchmove', [finger(130, 100)]);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
  });

  it('one touch press that marks reads once and the gesture gets that reader', () => {
    const reader = readerOf(true);
    const factory = vi.fn(() => reader);
    readerAt = factory;
    mount(); pressTouch();
    touch('touchmove', [finger(130, 100)]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startHighlightSwipe).mock.calls.at(-1)![0].reader).toBe(reader);
  });

  it('a mouse press never asks for a reader', () => {
    const factory = vi.fn(() => readerOf(true));
    readerAt = factory;
    mount(); press();
    move(130, 100);
    expect(factory).not.toHaveBeenCalled();
  });

  it('a mouse ignores the line test', () => {
    readerAt = () => readerOf(false);
    mount(); press();
    move(130, 100);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
  });
});

describe('useMarkSwipe on an existing highlight', () => {
  /** A press whose target is inside a highlight that sits on the page. */
  function pressOnMark(pointerType: 'touch' | 'mouse', x = 100, y = 100) {
    const page = document.createElement('div');
    const mark = document.createElement('div');
    mark.setAttribute('data-element-id', 'h1');
    const band = document.createElement('span');
    mark.append(band);
    page.append(mark);
    handler({ button: 0, pointerType, clientX: x, clientY: y, target: band, currentTarget: page } as unknown as PointerEvent);
  }

  it('R52: a finger moving sideways from a highlight lays a new band, as from any line of text', () => {
    mount(); pressOnMark('touch');
    move(130, 100);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
  });

  it('a finger moving down from a highlight lays nothing and leaves the scroll to the browser', () => {
    mount(); pressOnMark('touch');
    move(100, 130);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a mouse press on a highlight is a click that picks it and lays nothing, however far it drags', () => {
    mount(); pressOnMark('mouse');
    move(160, 100);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });
});

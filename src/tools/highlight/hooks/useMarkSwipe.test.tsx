import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
let pageGeometry: { width: number; height: number } | undefined;
let marker: Record<string, unknown> = { color: 'yellow', style: 'highlight', opacity: 1 };
let textDirection: 'ltr' | 'rtl' | undefined;
let fallbackDirection: 'ltr' | 'rtl' = 'ltr';
let readerAt: ((point: { x: number; y: number }) => Reader | null) | undefined;
type Reader = { onLine: (point: { x: number; y: number }) => boolean };
const readerOf = (on: boolean): Reader => ({ onLine: () => on });

function Probe() {
  handler = useMarkSwipe({
    pageIndex: 0, geometry: pageGeometry as never, elements: [],
    marker: marker as never,
    armed,
    getPointerPercent: (e: MouseEvent | TouchEvent) => ({ x: (e as MouseEvent).clientX / 10, y: (e as MouseEvent).clientY / 10 }),
    directionAt: () => fallbackDirection,
    textDirectionAt: () => textDirection,
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
  textDirection = undefined;
  fallbackDirection = 'ltr';
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

describe('READ-11: the swiped mark carries the pen stroke', () => {
  afterEach(() => { marker = { color: 'yellow', style: 'highlight', opacity: 1 }; });
  it('stroke sketch rides on the new element, and no key when the marker is clean', () => {
    marker = { ...marker, stroke: 'sketch' };
    mount(); press(); move(150, 150);
    expect(dispatch.mock.calls[0][0].payload.stroke).toBe('sketch');
    dispatch.mockClear(); window.dispatchEvent(new MouseEvent('mouseup'));
    act(() => render(null, container!));
    marker = { color: 'yellow', style: 'highlight', opacity: 1 };
    mount(); press(); move(150, 150);
    expect('stroke' in dispatch.mock.calls[0][0].payload).toBe(false);
  });
});

describe('READ-14: the swiped mark carries pencil', () => {
  afterEach(() => { marker = { color: 'yellow', style: 'highlight', opacity: 1 }; });
  it('style pencil rides on the new element, with no stroke or width', () => {
    marker = { color: 'yellow', style: 'pencil', opacity: 0.5, stroke: 'sketch', strokeWidth: 2 };
    mount(); press(); move(150, 150);
    const payload = dispatch.mock.calls[0][0].payload;
    expect(payload.style).toBe('pencil');
    expect('stroke' in payload).toBe(false);
    expect('strokeWidth' in payload).toBe(false);
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

describe('useMarkSwipe what a press lays', () => {
  const swipeCall = () => vi.mocked(startHighlightSwipe).mock.calls.at(-1)!;
  beforeEach(() => { vi.mocked(startHighlightSwipe).mockClear(); });
  afterEach(() => { marker = { color: 'yellow', style: 'highlight', opacity: 1 }; });

  it('lays an empty highlight at the press in the marker, and starts the swipe on it', () => {
    marker = { color: '#FF8FCF', style: 'underline', opacity: 0.5 };
    mount(); press(); move(150, 150);
    const added = dispatch.mock.calls[0][0].payload;
    expect(added).toMatchObject({ type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 0, height: 0, bands: [], color: '#FF8FCF', style: 'underline', opacity: 0.5 });
    expect(swipeCall()[1]).toMatchObject({ pageIndex: 0, id: added.id });
  });

  it('the plain marker adds no style or opacity of its own', () => {
    mount(); press(); move(150, 150);
    const added = dispatch.mock.calls[0][0].payload;
    expect('style' in added).toBe(false);
    expect('opacity' in added).toBe(false);
  });

  it('a mouse press swipes as a mouse, a finger as a finger whose click is not ours to swallow', () => {
    mount(); press(); move(150, 150);
    expect(swipeCall()[0].isMouse).toBe(true);
    window.dispatchEvent(new MouseEvent('mouseup'));
    pressTouch(); move(250, 150);
    expect(swipeCall()[0].isMouse).toBe(false);
  });

  it('a secondary button never marks', () => {
    mount();
    const target = document.createElement('div');
    handler({ button: 2, pointerType: 'mouse', clientX: 100, clientY: 100, target, currentTarget: target } as unknown as PointerEvent);
    move(150, 150);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps the marker armed: a swipe that asks to disarm dispatches nothing, anything else passes through', () => {
    mount(); press(); move(150, 150);
    dispatch.mockClear();
    const swipeDispatch = swipeCall()[0].dispatch;
    swipeDispatch({ type: 'DISARM_TOOL' } as never);
    expect(dispatch).not.toHaveBeenCalled();
    swipeDispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null } as never);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
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
  // The browser's zoom: only a zoomed page can move sideways under one finger, so only then is a line's move claimed.
  const zoom = (scale: number) => Object.defineProperty(window, 'visualViewport', { value: { scale }, configurable: true });
  beforeEach(() => zoom(2));
  afterEach(() => zoom(1));

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

  // R52 under the browser's zoom: a zoomed page pans sideways with one finger whatever touch-action says, so a press on a
  // line claims its sideways moves; a vertical one, or any move off the text, stays the browser's.
  it('on a line, a sideways move is claimed from the first pixel, a vertical one is left to the browser', () => {
    readerAt = () => readerOf(true);
    mount(); pressTouch();
    expect(touch('touchmove', [finger(100, 104)])).toBe(true);
    expect(touch('touchmove', [finger(104, 101)])).toBe(false);
  });

  // WebKit reads the touch listeners in place when a touch starts: one added at the press cannot stop that touch's pan.
  it('the claiming touchmove listener is in place before any press', () => {
    const added = vi.spyOn(window, 'addEventListener');
    readerAt = () => readerOf(true);
    mount();
    expect(added).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
    added.mockClear();
    pressTouch();
    expect(added.mock.calls.some(([type, , options]) => type === 'touchmove' && (options as AddEventListenerOptions)?.passive === false)).toBe(false);
  });

  it('at the browser\'s 1x nothing is claimed: the page cannot move sideways, and a scroll stays the browser\'s', () => {
    zoom(1);
    readerAt = () => readerOf(true);
    mount(); pressTouch();
    expect(touch('touchmove', [finger(104, 101)])).toBe(true);
    touch('touchmove', [finger(130, 100)]);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
    expect(touch('touchmove', [finger(160, 102)])).toBe(true);
  });

  it('zoomed in, a move is claimed only once it is as sideways as a mark: a diagonal stays a scroll', () => {
    readerAt = () => readerOf(true);
    mount(); pressTouch();
    expect(touch('touchmove', [finger(103, 102)])).toBe(true);
    expect(touch('touchmove', [finger(115, 110)])).toBe(true);
  });

  it('put down, the marker listens to no touch at all', () => {
    const added = vi.spyOn(window, 'addEventListener');
    armed = false;
    mount();
    expect(added.mock.calls.some(([type]) => type === 'touchmove')).toBe(false);
  });

  it('once a line\'s swipe has begun, its later moves stay claimed until the finger lifts', () => {
    readerAt = () => readerOf(true);
    mount(); pressTouch();
    touch('touchmove', [finger(130, 100)]);
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'ADD_ELEMENT' });
    expect(touch('touchmove', [finger(160, 102)])).toBe(false);
    expect(touch('touchmove', [finger(162, 140)])).toBe(false);
    touch('touchend', []);
    expect(touch('touchmove', [finger(200, 100)])).toBe(true);
  });

  it('two fingers are never claimed, mid-swipe or not: the pinch stays the browser\'s', () => {
    readerAt = () => readerOf(true);
    mount(); pressTouch();
    touch('touchmove', [finger(130, 100)]);
    expect(touch('touchmove', [finger(140, 100), finger(260, 100)])).toBe(true);
  });

  it('off a line, nothing is claimed: the browser pans the zoomed page', () => {
    readerAt = () => readerOf(false);
    mount(); pressTouch();
    expect(touch('touchmove', [finger(104, 100)])).toBe(true);
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

describe('the swipe preview draws the mark as it will stand', () => {
  afterEach(() => { marker = { color: 'yellow', style: 'highlight', opacity: 1 }; pageGeometry = undefined; });
  it('a sketched marker puts an svg path in the draft layer; a clean one fills divs', () => {
    pageGeometry = { width: 600, height: 800 };
    marker = { ...marker, stroke: 'sketch' };
    mount(); press(); move(150, 150);
    const { paintDraft } = vi.mocked(startHighlightSwipe).mock.calls.at(-1)![0];
    const node = document.createElement('div');
    const draft = document.createElement('div');
    draft.setAttribute('data-highlight-draft', '');
    node.append(draft);
    const g = { left: 10, top: 10, width: 50, height: 10, bands: [{ left: 0, top: 0, width: 100, height: 100 }] };
    paintDraft!(node, g);
    expect(draft.querySelector('svg[data-highlight-sketch] path')!.getAttribute('d')).toBeTruthy();
    expect(draft.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 300 80');
    paintDraft!(node, null);
    expect(draft.children).toHaveLength(0);
  });
});

describe('READ-01: the swipe decides the direction on a page with no text', () => {
  const swipeDirectionAfter = (...moves: Array<[number, number]>) => {
    vi.mocked(startHighlightSwipe).mockClear();
    mount(); press();
    move(...moves[0]);
    const deps = vi.mocked(startHighlightSwipe).mock.calls[0][0];
    let answer;
    for (const [x, y] of moves) { move(x, y); answer = deps.directionAt!({ x: x / 10, y: y / 10 }); }
    return answer;
  };
  it('a leftward swipe reads rtl while the reader language is ltr', () => {
    expect(swipeDirectionAfter([80, 100], [30, 100], [-40, 100])).toBe('rtl');
  });
  it('a rightward swipe reads ltr while the fallback is rtl', () => {
    fallbackDirection = 'rtl';
    expect(swipeDirectionAfter([120, 100], [180, 100], [20, 100])).toBe('ltr');
  });
  it('before a clear sideways move the fallback answers', () => {
    fallbackDirection = 'rtl';
    expect(swipeDirectionAfter([104, 100], [105, 103])).toBe('rtl');
  });
  it('a text page keeps its text direction whatever the swipe does', () => {
    textDirection = 'ltr';
    fallbackDirection = 'rtl';
    expect(swipeDirectionAfter([80, 100], [30, 100], [-40, 100])).toBe('ltr');
  });
});

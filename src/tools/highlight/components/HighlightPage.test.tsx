import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';

const startHighlightSwipe = vi.fn();
vi.mock('#editor-ui/highlight/highlightSwipeGesture.ts', () => ({ startHighlightSwipe }));
vi.mock('#editor-ui/PdfPageCanvas.tsx', () => ({ default: () => <canvas data-canvas /> }));

const { default: HighlightPage } = await import('./HighlightPage.tsx');

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};

let container: HTMLElement;
const dispatch = vi.fn();
const logAction = vi.fn();
const rearm = vi.fn();

function mount(elements: EditorElement[], marker = DEFAULT_MARKER) {
  act(() => render(
    <HighlightPage
      pdfDocument={null} pageIndex={0} widthPx={600} elements={elements} marker={marker}
      dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}}
    />,
    container,
  ));
  return container.querySelector<HTMLElement>('[data-page-overlay]')!;
}

function press(target: Element, { pointerType, button = 0 }: { pointerType: string; button?: number }) {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button, clientX: 50, clientY: 60 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => { target.dispatchEvent(event); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => render(null, container));
  container.remove();
  dispatch.mockClear();
  logAction.mockClear();
  startHighlightSwipe.mockClear();
  rearm.mockClear();
  localStorage.clear();
  vi.useRealTimers();
});

describe('HighlightPage', () => {
  it('draws each highlight on this page in a wrapper placed by its box in percent', () => {
    const other: EditorElement = { ...mark, id: 'h2', pageIndex: 1 };
    mount([mark, other]);
    const wrappers = container.querySelectorAll<HTMLElement>('[data-element-id]');
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0].dataset.elementId).toBe('h1');
    expect(wrappers[0].style.left).toBe('10%');
    expect(wrappers[0].style.top).toBe('20%');
    expect(wrappers[0].style.width).toBe('30%');
    expect(wrappers[0].style.height).toBe('4%');
    expect(wrappers[0].querySelector('[data-highlight-band]')).not.toBeNull();
  });

  it('a mouse press on the page adds an empty highlight in the marker and starts the swipe', () => {
    const overlay = mount([]);
    press(overlay, { pointerType: 'mouse' });
    const added = dispatch.mock.calls.find(([a]) => a.type === 'ADD_ELEMENT')?.[0].payload as HighlightElement;
    expect(added).toMatchObject({ type: 'highlight', pageIndex: 0, width: 0, height: 0, bands: [], color: DEFAULT_MARKER.color });
    expect(added.style).toBeUndefined();
    expect(added.opacity).toBeUndefined();
    expect(startHighlightSwipe).toHaveBeenCalledTimes(1);
    expect(startHighlightSwipe.mock.calls[0][1]).toMatchObject({ pageIndex: 0, id: added.id });
    expect(startHighlightSwipe.mock.calls[0][0].isMouse).toBe(true);
  });

  it('carries the marker underline and opacity onto the new highlight', () => {
    const overlay = mount([], { color: '#FF8FCF', style: 'underline', opacity: 0.5 });
    press(overlay, { pointerType: 'pen' });
    const added = dispatch.mock.calls.find(([a]) => a.type === 'ADD_ELEMENT')?.[0].payload as HighlightElement;
    expect(added).toMatchObject({ color: '#FF8FCF', style: 'underline', opacity: 0.5 });
  });

  it('a touch press, a secondary button and a press on a highlight do nothing', () => {
    const overlay = mount([mark]);
    press(overlay, { pointerType: 'touch' });
    press(overlay, { pointerType: 'mouse', button: 2 });
    press(container.querySelector('[data-element-id]')!, { pointerType: 'mouse' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(startHighlightSwipe).not.toHaveBeenCalled();
  });

  it('keeps the marker armed: a swipe that asks to disarm dispatches nothing', () => {
    const overlay = mount([]);
    press(overlay, { pointerType: 'mouse' });
    const swipeDispatch = startHighlightSwipe.mock.calls[0][0].dispatch;
    dispatch.mockClear();
    swipeDispatch({ type: 'DISARM_TOOL' });
    expect(dispatch).not.toHaveBeenCalled();
    swipeDispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: null });
  });
});

function move(target: Element, x = 50, y = 60, pointerType = 'mouse') {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y, buttons: 0 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => { target.dispatchEvent(event); });
}
const toolbar = () => container.querySelector<HTMLElement>('[role="toolbar"]');
const toolbarButton = (name: string) => container.querySelector<HTMLElement>(`[role="toolbar"] button[aria-label="${name}"]`)!;

describe('HighlightPage rest toolbar', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('opens on a highlight the pointer rests on, and not before', () => {
    mount([mark]);
    const wrapper = container.querySelector('[data-element-id]')!;
    move(wrapper);
    act(() => { vi.advanceTimersByTime(600); });
    expect(toolbar()).toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(toolbar()).not.toBeNull();
  });

  it('a tap with a finger opens it at once', () => {
    mount([mark]);
    const wrapper = container.querySelector('[data-element-id]')!;
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'touch' });
    act(() => { wrapper.dispatchEvent(down); wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(toolbar()).not.toBeNull();
  });

  it('a color change updates the highlight, logs one undo step and re-arms the marker', () => {
    mount([mark]);
    move(container.querySelector('[data-element-id]')!);
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { toolbarButton('Underline').click(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_ELEMENT', payload: { id: 'h1', changes: { style: 'underline' } } });
    const entry = dispatch.mock.calls.find(([a]) => a.type === 'ADD_ACTION_HISTORY')?.[0].payload;
    expect(entry).toMatchObject({ operation: 'update', updates: [{ id: 'h1', after: { style: 'underline' } }] });
    expect(rearm).toHaveBeenCalledWith({ style: 'underline' });
  });

  it('Delete removes the highlight, logs it for undo and closes', () => {
    mount([mark]);
    move(container.querySelector('[data-element-id]')!);
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { toolbarButton('Delete').click(); });
    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_ELEMENT', payload: 'h1' });
    expect(logAction).toHaveBeenCalledWith('delete', 'DELETE_ELEMENT', 0, expect.stringContaining('Delete'), [{ element: mark, index: 0 }]);
    expect(toolbar()).toBeNull();
  });

  it('a press elsewhere closes it', () => {
    mount([mark]);
    move(container.querySelector('[data-element-id]')!);
    act(() => { vi.advanceTimersByTime(800); });
    press(document.body, { pointerType: 'mouse' });
    expect(toolbar()).toBeNull();
  });
});

function stubPointer(coarse: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('coarse') ? coarse : true })) as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

describe('HighlightPage one-time hint', () => {
  let restore = () => {};
  beforeEach(() => { restore = stubPointer(false); });
  afterEach(() => restore());
  const finishStroke = (overlay: HTMLElement) => {
    press(overlay, { pointerType: 'mouse' });
    const swipe = startHighlightSwipe.mock.calls.at(-1)![0];
    act(() => swipe.dispatch({ type: 'UPDATE_ELEMENT', payload: { id: startHighlightSwipe.mock.calls.at(-1)![1].id, changes: { left: 10, top: 20, width: 30, height: 4, bands: [{ left: 0, top: 0, width: 100, height: 100 }] } } }));
  };
  beforeEach(() => { vi.useFakeTimers(); });

  it('shows after the first mark, beside the end of the ink, once', () => {
    const overlay = mount([]);
    finishStroke(overlay);
    const hint = container.querySelector<HTMLElement>('[data-mark-hint]');
    expect(hint?.textContent).toBe('Rest on a highlight to change it');
    expect(hint?.style.left).toBe('40%');
    act(() => { vi.advanceTimersByTime(4100); });
    expect(container.querySelector('[data-mark-hint]')).toBeNull();
    finishStroke(overlay);
    expect(container.querySelector('[data-mark-hint]')).toBeNull();
  });

  it('asks to tap on a touch screen', () => {
    restore();
    restore = stubPointer(true);
    finishStroke(mount([]));
    expect(container.querySelector('[data-mark-hint]')?.textContent).toBe('Tap a highlight to change it');
  });

  it('a new stroke takes it away', () => {
    const overlay = mount([]);
    finishStroke(overlay);
    press(overlay, { pointerType: 'mouse' });
    expect(container.querySelector('[data-mark-hint]')).toBeNull();
  });
});

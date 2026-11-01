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

function mount(elements: EditorElement[], marker = DEFAULT_MARKER) {
  act(() => render(
    <HighlightPage
      pdfDocument={null} pageIndex={0} widthPx={600} elements={elements} marker={marker}
      dispatch={dispatch} logAction={logAction} setAnnouncement={() => {}} cardRef={() => {}}
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

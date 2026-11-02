import { render } from 'preact';
import type * as preact from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { swallowNextClick } from '#lib/gestures/swallowNextClick.ts';
import { DEFAULT_MARKER } from '../lib/marker/markerState.ts';

const startHighlightSwipe = vi.fn();
vi.mock('#editor-ui/highlight/highlightSwipeGesture.ts', () => ({ startHighlightSwipe }));
const readScanUnit = vi.fn();
vi.mock('../lib/marker/scanUnits.ts', () => ({ readScanUnit }));
vi.mock('#editor-ui/PdfPageCanvas.tsx', () => ({ default: () => <canvas data-canvas /> }));

let geometryOverride: { width: number; height: number } | null = null;
vi.mock('../hooks/usePageGeometry.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../hooks/usePageGeometry.ts')>();
  return { usePageGeometry: (...args: Parameters<typeof original.usePageGeometry>) => {
    const real = original.usePageGeometry(...args);
    return geometryOverride ? { ...real, geometry: geometryOverride as never } : real;
  } };
});
vi.mock('../lib/outline/markOutline.ts', () => ({ outlineVertices: () => [[0, 0], [10, 0], [10, 10]] }));
vi.mock('#editor/geometry/sketchStroke.ts', () => ({
  strokeSeed: () => 7, sketchBands: vi.fn(() => [['Z']]), sketchUnderline: vi.fn(() => [['Z']]), svgPath: () => 'M0 0Z',
}));

const { default: HighlightPage } = await import('./HighlightPage.tsx');

const mark: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};

const savedComment: CommentElement = {
  id: 'c1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 30, height: 4,
  comment: 'Check this', anchor: { kind: 'element', elementId: 'h1' },
};

let container: HTMLElement;
const dispatch = vi.fn();
const logAction = vi.fn();
const rearm = vi.fn();

function mount(elements: EditorElement[], marker = DEFAULT_MARKER, armed?: boolean, extra: { chrome?: number; pickedId?: string | null; openMarks?: { openId: string | null; hoverId: string | null }; onPickMark?: (id: string) => void; rail?: preact.ComponentChildren; pageTurns?: Record<number, 1 | 2 | 3> } = {}) {
  act(() => render(
    <HighlightPage
      pdfDocument={null} pageIndex={0} widthPx={600} elements={elements} marker={marker} armed={armed} {...extra}
      dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}} onRotate={() => {}} onClear={() => {}}
    />,
    container,
  ));
  return container.querySelector<HTMLElement>('[data-page-overlay]')!;
}

function press(target: Element, { pointerType, button = 0 }: { pointerType: string; button?: number }) {
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button, clientX: 50, clientY: 60 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => { target.dispatchEvent(event); });
  // The swipe starts once the pointer has travelled 4 px from the press, a finger 10 px and clearly sideways.
  act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 + 12, clientY: 60 })); });
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
  readScanUnit.mockReset();
  rearm.mockClear();
  localStorage.clear();
  geometryOverride = null;
  vi.useRealTimers();
});

describe('HighlightPage', () => {
  it('READ-11: a sketched mark gets its box in points from the page geometry, a clean one stays bands', () => {
    geometryOverride = { width: 600, height: 800 };
    mount([{ ...mark, stroke: 'sketch' }, { ...mark, id: 'h2', stroke: undefined }]);
    const svg = container.querySelector('[data-element-id="h1"] svg[data-highlight-sketch]')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 180 32');
    expect(container.querySelector('[data-element-id="h2"] [data-highlight-band]')).not.toBeNull();
  });

  it('READ-14: a pencil mark is hatched in its color instead of banded, with the box in points', async () => {
    geometryOverride = { width: 600, height: 800 };
    mount([{ ...mark, style: 'pencil' }, { ...mark, id: 'h2' }]);
    await vi.waitFor(() => expect(container.querySelector('[data-element-id="h1"] svg[data-highlight-hatch]')).not.toBeNull(), { timeout: 3000 });
    const svg = container.querySelector('[data-element-id="h1"] svg[data-highlight-hatch]')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 180 32');
    expect(container.querySelector('[data-element-id="h1"] [data-highlight-band]')).toBeNull();
    expect(container.querySelector('[data-element-id="h2"] [data-highlight-band]')).not.toBeNull();
  });

  it('READ-13: only the open mark wears the pencil outline, and the card-hovered one a faint pass', async () => {
    geometryOverride = { width: 600, height: 800 };
    mount([mark, { ...mark, id: 'h2', top: 40 }, { ...mark, id: 'h3', top: 60 }], DEFAULT_MARKER, undefined, { openMarks: { openId: 'h1', hoverId: 'h2' } });
    await vi.waitFor(() => expect(container.querySelectorAll('svg[data-mark-outline]')).toHaveLength(2), { timeout: 3000 });
    expect(container.querySelector('[data-element-id="h1"] svg[data-mark-outline]')).not.toBeNull();
    expect(container.querySelector('[data-element-id="h2"] svg[data-mark-outline]')).not.toBeNull();
    expect(container.querySelector('[data-element-id="h3"] svg[data-mark-outline]')).toBeNull();
  });

  it('READ-13: with nothing open no outline is drawn', () => {
    geometryOverride = { width: 600, height: 800 };
    mount([mark]);
    expect(container.querySelector('svg[data-mark-outline]')).toBeNull();
  });

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

  it('marks are one roving tab stop and focusing one with the keyboard opens its toolbar', () => {
    const restore = stubPointer(false); // the toolbar on the page is the mouse's
    const later: EditorElement = { ...mark, id: 'h2', top: 60 };
    mount([later, mark]);
    const nodes = [...container.querySelectorAll<HTMLElement>('[data-editor-element-id]')];
    expect(nodes.map((n) => [n.dataset.editorElementId, n.tabIndex])).toEqual([['h2', -1], ['h1', 0]]);
    act(() => nodes[0].focus());
    expect(container.querySelector('[data-rest-toolbar]')).not.toBeNull();
    restore();
  });

  it('a mouse press on the page adds an empty highlight in the marker and starts the swipe', () => {
    const overlay = mount([]);
    press(overlay, { pointerType: 'mouse' });
    const added = dispatch.mock.calls.find(([a]) => a.type === 'ADD_ELEMENT')?.[0].payload as HighlightElement;
    expect(added).toMatchObject({ type: 'highlight', pageIndex: 0, width: 0, height: 0, bands: [], color: DEFAULT_MARKER.color });
    expect(added.style).toBeUndefined();
    expect(added.opacity).toBe(DEFAULT_MARKER.opacity);
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
    const overlay = mount([mark], DEFAULT_MARKER, false);
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

function textPage(strings: string[]) {
  const items = strings.map((str) => ({ str, transform: [1, 0, 0, 1, 10, 300], width: 40, height: 10 }));
  const chunks = [{ done: false, value: { items } }, { done: true, value: undefined }];
  const page = {
    view: [0, 0, 200, 400], rotate: 0,
    streamTextContent: () => ({ getReader: () => ({ read: async () => chunks.shift() }) }),
  };
  return { getPage: async () => page } as never;
}

describe('HighlightPage chrome scale', () => {
  const parts = () => ({
    header: container.querySelector<HTMLElement>('[data-page-header]')!,
    rail: container.querySelector<HTMLElement>('[data-notes-rail]')!,
    card: container.querySelector<HTMLElement>('[data-page-wrapper], [data-page-card]')?.parentElement ?? container,
  });
  it('draws the header and the rail at normal size when the chrome scale is 1', () => {
    mount([mark], DEFAULT_MARKER, undefined, { rail: <div /> });
    expect(parts().header.style.zoom).toBe('');
    expect(parts().rail.style.zoom).toBe('');
  });
  it('scales both with the chrome scale, and the notes column is NOTES_W of it', () => {
    mount([mark], DEFAULT_MARKER, undefined, { chrome: 1.5, rail: <div /> });
    expect(parts().header.style.zoom).toBe('1.5');
    expect(parts().rail.style.zoom).toBe('1.5');
    expect(container.querySelector<HTMLElement>('[style*="--notes-w"]')!.style.getPropertyValue('--notes-w')).toBe('360px');
  });
  it('is NOTES_W px at chrome 1', () => {
    mount([mark], DEFAULT_MARKER, undefined, { rail: <div /> });
    expect(container.querySelector<HTMLElement>('[style*="--notes-w"]')!.style.getPropertyValue('--notes-w')).toBe('240px');
  });
});

describe('HighlightPage swipe direction', () => {
  const swipeDirection = async (strings: string[]) => {
    await act(async () => {
      render(
        <HighlightPage
          pdfDocument={textPage(strings)} pageIndex={0} widthPx={600} elements={[]} marker={DEFAULT_MARKER}
          dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}} onRotate={() => {}} onClear={() => {}}
        />,
        container,
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    press(container.querySelector<HTMLElement>('[data-page-overlay]')!, { pointerType: 'mouse' });
    return startHighlightSwipe.mock.calls[0][0].direction;
  };

  it('a Hebrew page swipes right to left, from its own text', async () => {
    expect(await swipeDirection(['שלום עולם'])).toBe('rtl');
  });

  it('an English page swipes left to right', async () => {
    expect(await swipeDirection(['hello world'])).toBe('ltr');
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
  // The full bar (color and style too) is the mouse's; the same bar serves a finger.
  let restorePointer = () => {};
  beforeEach(() => { vi.useFakeTimers(); restorePointer = stubPointer(false); });
  afterEach(() => restorePointer());

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

  function mouseClickOn(target: Element, detail: number) {
    const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    act(() => { target.dispatchEvent(down); target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail })); });
  }

  it('a mouse click on a highlight opens it at once', () => {
    mount([mark]);
    mouseClickOn(container.querySelector('[data-element-id]')!, 1);
    expect(toolbar()).not.toBeNull();
  });

  it('a mouse click on a highlight opens it while the marker is put down', () => {
    mount([mark], DEFAULT_MARKER, false);
    mouseClickOn(container.querySelector('[data-element-id]')!, 1);
    expect(toolbar()).not.toBeNull();
  });

  it('a double click on a highlight does not open it', () => {
    mount([mark]);
    mouseClickOn(container.querySelector('[data-element-id]')!, 2);
    expect(toolbar()).toBeNull();
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

  it('R27: Comment on a mark with no comment adds a blank one anchored to it and makes it active', () => {
    mount([mark]);
    move(container.querySelector('[data-element-id]')!);
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { toolbarButton('Comment').click(); });
    const added = dispatch.mock.calls.find(([a]) => a.type === 'ADD_ELEMENT')?.[0].payload;
    expect(added).toMatchObject({ type: 'comment', comment: '', anchor: { kind: 'element', elementId: 'h1' } });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: added.id });
    expect(logAction).not.toHaveBeenCalled();
    expect(toolbar()).toBeNull();
  });

  it('R27: Comment on a mark that has one makes that comment active and adds nothing', () => {
    mount([mark, savedComment]);
    move(container.querySelector('[data-element-id]')!);
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { toolbarButton('Comment').click(); });
    expect(dispatch.mock.calls.some(([a]) => a.type === 'ADD_ELEMENT')).toBe(false);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'c1' });
  });

  it('R27: Delete takes the highlight and its comment in one undo entry', () => {
    mount([mark, savedComment]);
    move(container.querySelector('[data-element-id]')!);
    act(() => { vi.advanceTimersByTime(800); });
    act(() => { toolbarButton('Delete').click(); });
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction).toHaveBeenCalledWith('delete', 'DELETE_ELEMENT', 0, expect.any(String), [
      { element: mark, index: 0 }, { element: savedComment, index: 1 },
    ]);
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

describe('HighlightPage picking a mark', () => {
  let restore = () => {};
  afterEach(() => restore());

  it('on a finger a tap on a mark reports it upward and opens no toolbar on the page', () => {
    restore = stubPointer(true);
    const onPickMark = vi.fn();
    mount([mark], DEFAULT_MARKER, true, { onPickMark });
    act(() => { container.querySelector<HTMLElement>('[data-element-id="h1"]')!.click(); });
    expect(onPickMark).toHaveBeenCalledWith('h1');
    expect(container.querySelector('[data-rest-toolbar]')).toBeNull();
  });

  it('R39 on a touch screen with a keyboard: focusing a mark with the keyboard picks it, and opens no toolbar on the page', () => {
    restore = stubPointer(true);
    const onPickMark = vi.fn();
    mount([mark], DEFAULT_MARKER, true, { onPickMark });
    act(() => container.querySelector<HTMLElement>('[data-editor-element-id="h1"]')!.focus());
    expect(onPickMark).toHaveBeenCalledWith('h1');
    expect(container.querySelector('[data-rest-toolbar]')).toBeNull();
  });

  it('the picked mark carries data-picked, the others do not', () => {
    restore = stubPointer(true);
    mount([mark, { ...mark, id: 'h2', top: 60 }], DEFAULT_MARKER, true, { pickedId: 'h2' });
    expect(container.querySelector('[data-element-id="h1"]')!.hasAttribute('data-picked')).toBe(false);
    expect(container.querySelector('[data-element-id="h2"]')!.hasAttribute('data-picked')).toBe(true);
  });

  it('with a fine pointer a click still opens the mark toolbar', () => {
    restore = stubPointer(false);
    const onPickMark = vi.fn();
    mount([mark], DEFAULT_MARKER, undefined, { onPickMark });
    act(() => { container.querySelector<HTMLElement>('[data-element-id="h1"]')!.click(); });
    expect(container.querySelector('[data-rest-toolbar]')).not.toBeNull();
    expect(onPickMark).not.toHaveBeenCalled();
  });
});

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

describe('HighlightPage turns', () => {
  it('tells the page wrapper how many quarter turns it was given, so an underline can find the text edge', () => {
    mount([mark], DEFAULT_MARKER, undefined, { pageTurns: { 0: 1 } });
    expect(container.querySelector<HTMLElement>('[data-page-wrapper]')!.getAttribute('data-page-turns')).toBe('1');
  });
  it('carries no attribute on an unturned page', () => {
    mount([mark], DEFAULT_MARKER, undefined, { pageTurns: { 3: 2 } });
    expect(container.querySelector<HTMLElement>('[data-page-wrapper]')!.hasAttribute('data-page-turns')).toBe(false);
  });
});

describe('HighlightPage cursor (R14)', () => {
  let restore = () => {};
  afterEach(() => restore());
  const wrapper = () => container.querySelector<HTMLElement>('[data-page-wrapper]')!;

  it('on a fine pointer the page wears the highlighter in the armed color', () => {
    restore = stubPointer(false);
    mount([], { color: '#FF8FCF', style: 'highlight', opacity: 1 });
    const cursor = wrapper().style.cursor;
    expect(cursor).toContain('data:image/svg+xml');
    expect(decodeURIComponent(cursor)).toContain('#FF8FCF');
    expect(cursor.endsWith('crosshair')).toBe(true);
  });

  it('put down, the page wears the ordinary cursor', () => {
    restore = stubPointer(false);
    mount([], DEFAULT_MARKER, false);
    expect(wrapper().style.cursor).toBe('');
  });

  it('follows the marker: underlining swaps the tip', () => {
    restore = stubPointer(false);
    mount([], { color: '#FF8FCF', style: 'underline', opacity: 1 });
    expect(decodeURIComponent(wrapper().style.cursor)).toContain('data-tip="fine"');
  });

  it('on a finger there is no cursor to set', () => {
    restore = stubPointer(true);
    mount([]);
    expect(wrapper().style.cursor).toBe('');
  });
});

describe('HighlightPage click marks on a digital page (R10 to R12)', () => {
  // One line, 'hello world', 40 pt wide at x = 10 on a 200 x 400 page: left 5%, top 22.5%, 20% wide, 2.5% tall.
  // The overlay is measured at 200 x 400 px, so a client point is its page point.
  const WORD = { x: 20, y: 92 };
  let overlay: HTMLElement;

  let doc: ReturnType<typeof textPage>;
  const renderPage = (elements: EditorElement[], marker = DEFAULT_MARKER, armed?: boolean) => act(() => render(
    <HighlightPage
      pdfDocument={doc} pageIndex={0} widthPx={200} elements={elements} marker={marker} armed={armed}
      dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}} onRotate={() => {}} onClear={() => {}}
    />,
    container,
  ));

  async function mountText(elements: EditorElement[] = [], marker = DEFAULT_MARKER, armed?: boolean) {
    doc = textPage(['hello world']);
    await act(async () => { renderPage(elements, marker, armed); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    overlay = container.querySelector<HTMLElement>('[data-page-overlay]')!;
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 400, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) });
  }

  /** A mouse press, its release and its click, as the browser sends them. */
  function clickAt(detail: number, target: Element = overlay, at = WORD) {
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: at.x, clientY: at.y });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    act(() => { target.dispatchEvent(down); });
    act(() => { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: at.x, clientY: at.y })); });
    act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail, clientX: at.x, clientY: at.y })); });
  }

  /** The press's swipe lays ink, as a press that drifted a few pixels does. */
  function layInk() {
    const [deps, target] = startHighlightSwipe.mock.calls.at(-1)!;
    act(() => deps.dispatch({ type: 'UPDATE_ELEMENT', payload: { id: target.id, changes: { left: 5, top: 22, width: 20, height: 3, bands: [{ left: 0, top: 0, width: 100, height: 100 }] } } }));
    return target.id as string;
  }

  const added = () => dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'ADD_ELEMENT' && a.payload.bands.length > 0).map((a) => a.payload as HighlightElement);

  it('a single click marks nothing', async () => {
    await mountText();
    clickAt(1);
    expect(added()).toHaveLength(0);
  });

  it('sees the click a mouse swipe swallows, because it listens from the press on', async () => {
    await mountText();
    // As the swipe does when it commits on mouseup: swallow the click that follows.
    startHighlightSwipe.mockImplementationOnce(() => {
      window.addEventListener('mouseup', () => swallowNextClick(), { once: true });
    });
    clickAt(2);
    expect(added()).toHaveLength(1);
  });

  it('a double-click marks the word under it, in the armed marker, as one undo step', async () => {
    await mountText([], { color: '#FF8FCF', style: 'underline', opacity: 0.5 });
    clickAt(2);
    const [mark] = added();
    expect(mark).toMatchObject({ type: 'highlight', pageIndex: 0, color: '#FF8FCF', style: 'underline', opacity: 0.5 });
    expect(mark.bands).toHaveLength(1);
    expect(mark.left).toBeCloseTo(5, 0);
    expect(mark.width).toBeLessThan(20);
    expect(mark.width).toBeGreaterThan(5);
    expect(logAction).toHaveBeenCalledWith('add', 'ADD_SHAPE', 0, expect.any(String), [expect.objectContaining({ element: mark })]);
    expect(dispatch.mock.calls.some(([a]) => a.type === 'UNDO')).toBe(false);
  });

  it('a double-click lays nothing while the marker is put down', async () => {
    await mountText([], DEFAULT_MARKER, false);
    clickAt(2);
    expect(added()).toHaveLength(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a double-click on the gap between words, or off the text, marks nothing', async () => {
    await mountText();
    clickAt(2, overlay, { x: 20, y: 300 });
    expect(added()).toHaveLength(0);
  });

  it('a double-click whose press laid ink undoes that ink first, then adds the word, so there is never a second mark', async () => {
    await mountText();
    // The press of the second click lays ink before its click arrives.
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: WORD.x, clientY: WORD.y });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    act(() => { overlay.dispatchEvent(down); });
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: WORD.x + 6, clientY: WORD.y })); });
    layInk();
    dispatch.mockClear();
    act(() => { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
    act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2, clientX: WORD.x, clientY: WORD.y })); });
    const types = dispatch.mock.calls.map(([a]) => a.type);
    expect(types.indexOf('UNDO')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('UNDO')).toBeLessThan(types.indexOf('ADD_ELEMENT'));
  });

  it('never removes an existing highlight: a double-click on one does nothing', async () => {
    const over: HighlightElement = { ...mark, left: 5, top: 22, width: 20, height: 3 };
    await mountText([over]);
    const wrapper = container.querySelector('[data-element-id]')!;
    clickAt(2, wrapper);
    expect(added()).toHaveLength(0);
    expect(dispatch.mock.calls.some(([a]) => a.type === 'UNDO' || a.type === 'DELETE_ELEMENT')).toBe(false);
  });

  it('a third click grows the word it just laid to the sentence, replacing it', async () => {
    await mountText();
    clickAt(2);
    const [word] = added();
    act(() => renderPage([word]));
    dispatch.mockClear();
    clickAt(3, container.querySelector(`[data-element-id="${word.id}"]`)!);
    const types = dispatch.mock.calls.map(([a]) => a.type);
    expect(types.indexOf('UNDO')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('UNDO')).toBeLessThan(types.indexOf('ADD_ELEMENT'));
    expect(added()[0].width).toBeGreaterThan(word.width);
  });
});

describe('HighlightPage sweep (R13)', () => {
  const animate = vi.fn();
  let restore = () => {};
  beforeEach(() => { (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate; });
  afterEach(() => {
    animate.mockReset();
    restore();
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  function markByClick(strings: string[], reduced = false) {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('reduce') ? reduced : false })) as typeof window.matchMedia;
    restore = () => { window.matchMedia = original; };
    const doc = textPage(strings);
    const draw = (elements: EditorElement[]) => act(() => render(
      <HighlightPage
        pdfDocument={doc} pageIndex={0} widthPx={200} elements={elements} marker={DEFAULT_MARKER}
        dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}} onRotate={() => {}} onClear={() => {}}
      />,
      container,
    ));
    return { doc, draw };
  }

  async function laidByDoubleClick(strings: string[], reduced = false) {
    const { draw } = markByClick(strings, reduced);
    await act(async () => { draw([]); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const overlay = container.querySelector<HTMLElement>('[data-page-overlay]')!;
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 400, width: 200, height: 400, x: 0, y: 0, toJSON: () => ({}) });
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 92 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    act(() => { overlay.dispatchEvent(down); });
    act(() => { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
    act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2, clientX: 20, clientY: 92 })); });
    const laid = dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'ADD_ELEMENT').at(-1)!.payload as HighlightElement;
    expect(animate).not.toHaveBeenCalled();
    draw([laid]);
    return laid;
  }

  it('draws the new mark in from its first letter: a clip on each band, once it is on the page', async () => {
    await laidByDoubleClick(['hello world']);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(
      [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0)' }],
      { delay: 0, duration: 110, easing: 'cubic-bezier(.3, .7, .3, 1)', fill: 'backwards' },
    );
  });

  it('does not sweep again on later renders', async () => {
    const laid = await laidByDoubleClick(['hello world']);
    act(() => render(
      <HighlightPage
        pdfDocument={null} pageIndex={0} widthPx={300} elements={[laid]} marker={DEFAULT_MARKER}
        dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}} onRotate={() => {}} onClear={() => {}}
      />,
      container,
    ));
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('sweeps from the right edge on a Hebrew page', async () => {
    await laidByDoubleClick(['שלום עולם']);
    expect(animate.mock.calls[0][0][0]).toEqual({ clipPath: 'inset(0 0 0 100%)' });
  });

  it('draws nothing under reduced motion', async () => {
    await laidByDoubleClick(['hello world'], true);
    expect(animate).not.toHaveBeenCalled();
  });

  it('a mark laid by a swipe is not swept', async () => {
    const { draw } = markByClick(['hello world']);
    await act(async () => { draw([]); });
    draw([mark]);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('HighlightPage click marks on a scan (R10)', () => {
  let overlay: HTMLElement;
  beforeEach(() => {
    overlay = mount([]);
    overlay.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 800, width: 600, height: 800, x: 0, y: 0, toJSON: () => ({}) });
  });

  function clickAt(detail: number, target: Element = overlay) {
    const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 60, clientY: 200 });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    act(() => { target.dispatchEvent(down); });
    act(() => { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
    act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail, clientX: 60, clientY: 200 })); });
  }
  const added = () => dispatch.mock.calls.map(([a]) => a).filter((a) => a.type === 'ADD_ELEMENT' && a.payload.bands.length > 0).map((a) => a.payload as HighlightElement);

  it('a double-click marks the word the canvas reader finds, read from the displayed canvas', () => {
    readScanUnit.mockReturnValue({ left: 8, top: 24, width: 12, height: 2 });
    clickAt(2);
    expect(readScanUnit).toHaveBeenCalledTimes(1);
    const [canvas, point, unit, pageHeight] = readScanUnit.mock.calls[0];
    expect(canvas).toBe(container.querySelector('canvas'));
    expect(point.x).toBeCloseTo(10, 5);
    expect(point.y).toBeCloseTo(25, 5);
    expect(unit).toBe('word');
    expect(pageHeight).toBe(792);
    expect(added()[0]).toMatchObject({ type: 'highlight', left: 8, top: 24, width: 12, height: 2, color: DEFAULT_MARKER.color });
    expect(logAction).toHaveBeenCalledWith('add', 'ADD_SHAPE', 0, expect.any(String), [expect.objectContaining({ index: 0 })]);
  });

  it('a third click takes the line, because a scan has no sentences', () => {
    readScanUnit.mockReturnValueOnce({ left: 8, top: 24, width: 12, height: 2 }).mockReturnValueOnce({ left: 5, top: 24, width: 80, height: 2 });
    clickAt(2);
    const word = added()[0];
    act(() => render(
      <HighlightPage
        pdfDocument={null} pageIndex={0} widthPx={600} elements={[word]} marker={DEFAULT_MARKER}
        dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}} onRotate={() => {}} onClear={() => {}}
      />,
      container,
    ));
    dispatch.mockClear();
    clickAt(3, container.querySelector(`[data-element-id="${word.id}"]`)!);
    expect(readScanUnit.mock.calls[1][2]).toBe('line');
    expect(dispatch.mock.calls.map(([a]) => a.type)).toEqual(['UNDO', 'ADD_ELEMENT']);
  });

  it('marks nothing when the click is not on a word', () => {
    readScanUnit.mockReturnValue(null);
    clickAt(2);
    expect(added()).toHaveLength(0);
  });

  it('a single click never reads the canvas', () => {
    clickAt(1);
    expect(readScanUnit).not.toHaveBeenCalled();
  });
});

describe('HighlightPage touch swipe, armed', () => {
  let restorePointer = () => {};
  beforeEach(() => { restorePointer = stubPointer(true); });
  afterEach(() => restorePointer());

  it('a one-finger press starts the same swipe as a mouse, and not as a mouse (its click is not ours to swallow)', () => {
    const overlay = mount([], DEFAULT_MARKER, true);
    press(overlay, { pointerType: 'touch' });
    const added = dispatch.mock.calls.find(([a]) => a.type === 'ADD_ELEMENT')?.[0].payload as HighlightElement;
    expect(added).toMatchObject({ type: 'highlight', pageIndex: 0, width: 0, height: 0, bands: [], color: DEFAULT_MARKER.color });
    expect(startHighlightSwipe).toHaveBeenCalledTimes(1);
    expect(startHighlightSwipe.mock.calls[0][0].isMouse).toBe(false);
    expect(startHighlightSwipe.mock.calls[0][1]).toMatchObject({ pageIndex: 0, id: added.id });
  });

  it('the page stops scrolling for the gesture: it owns the touch while armed', () => {
    const overlay = mount([], DEFAULT_MARKER, true);
    expect(overlay.hasAttribute('data-touch-armed')).toBe(true);
    mount([], DEFAULT_MARKER, false);
    expect(overlay.hasAttribute('data-touch-armed')).toBe(false);
  });

  it('on a fine pointer the armed page keeps its text selectable and scrolling: the touch style is touch only', () => {
    restorePointer();
    restorePointer = stubPointer(false);
    const overlay = mount([], DEFAULT_MARKER, true);
    expect(overlay.hasAttribute('data-touch-armed')).toBe(false);
  });

  it('a mouse drag lays a mark while armed and none once the marker is put down', () => {
    restorePointer();
    restorePointer = stubPointer(false);
    const overlay = mount([], DEFAULT_MARKER, false);
    press(overlay, { pointerType: 'mouse' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(startHighlightSwipe).not.toHaveBeenCalled();
    mount([], DEFAULT_MARKER, true);
    press(overlay, { pointerType: 'mouse' });
    expect(startHighlightSwipe).toHaveBeenCalledTimes(1);
  });

  it('a mouse still marks as before while a finger is armed', () => {
    const overlay = mount([], DEFAULT_MARKER, true);
    press(overlay, { pointerType: 'mouse' });
    expect(startHighlightSwipe.mock.calls[0][0].isMouse).toBe(true);
  });

  it('R52: a finger moving sideways from a highlight starts a swipe; a mouse press on one starts nothing', () => {
    mount([mark], DEFAULT_MARKER, true);
    press(container.querySelector('[data-element-id]')!, { pointerType: 'mouse' });
    expect(startHighlightSwipe).not.toHaveBeenCalled();
    press(container.querySelector('[data-element-id]')!, { pointerType: 'touch' });
    expect(startHighlightSwipe).toHaveBeenCalledTimes(1);
  });

  it('without it a finger does nothing new', () => {
    const overlay = mount([], DEFAULT_MARKER, false);
    press(overlay, { pointerType: 'touch' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(startHighlightSwipe).not.toHaveBeenCalled();
    expect(overlay.hasAttribute('data-touch-armed')).toBe(false);
  });

  describe('comment markers', () => {
    it('a commented mark wears no comment marker, with or without a rail', () => {
      mount([mark, savedComment]);
      expect(container.querySelector('[data-comment-marker]')).toBeNull();
      act(() => render(
        <HighlightPage
          pdfDocument={null} pageIndex={0} widthPx={600} elements={[mark, savedComment]} marker={DEFAULT_MARKER} rail={<div data-testid="rail" />}
          dispatch={dispatch} logAction={logAction} rearm={rearm} setAnnouncement={() => {}} cardRef={() => {}} onRotate={() => {}} onClear={() => {}}
        />,
        container,
      ));
      expect(container.querySelector('[data-testid="rail"]')).not.toBeNull();
      expect(container.querySelector('[data-comment-marker]')).toBeNull();
    });
  });
});

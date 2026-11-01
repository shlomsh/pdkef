import { describe, it, expect } from 'vitest';
import type { ActionHistoryEntry } from '#editor/model/actionHistory.ts';
import type {
  EditorElement,
  LineElement,
  RectangleElement,
  TextElement,
  WhiteoutElement,
} from '#editor/model/editorModel.ts';
import { createPageGeometry } from '#editor/geometry/coords.ts';
import { turnElement } from '#editor/geometry/pageTurn.ts';
import { elementsReducer, initialElementsState, type ElementsAction, type ElementsState } from '#editor/model/elementsReducer.ts';
import { reducer, type SignToolAction, type SignToolState } from './SignToolContext.tsx';

const textElement = (id: string, overrides: Partial<TextElement> = {}): TextElement => ({
  id,
  type: 'text',
  pageIndex: 0,
  left: 0,
  top: 0,
  text: '',
  ...overrides,
});

const rectangleElement = (id: string, overrides: Partial<RectangleElement> = {}): RectangleElement => ({
  id,
  type: 'rectangle',
  pageIndex: 0,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  ...overrides,
});

const lineElement = (id: string, overrides: Partial<LineElement> = {}): LineElement => ({
  id,
  type: 'line',
  pageIndex: 0,
  x1: 0,
  y1: 0,
  x2: 0,
  y2: 0,
  ...overrides,
});

const whiteoutElement = (id: string, overrides: Partial<WhiteoutElement> = {}): WhiteoutElement => ({
  id,
  type: 'whiteout',
  pageIndex: 0,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  ...overrides,
});

const addHistory = (
  id: string,
  type: string,
  element: EditorElement,
  index = 0,
): ActionHistoryEntry<EditorElement> => ({
  id,
  type,
  operation: 'add',
  pageIndex: element.pageIndex || 0,
  description: type,
  timestamp: 1,
  elements: [{ element, index }],
});

describe('SignToolContext Reducer', () => {
  const initialState: SignToolState = {
    selectedTool: null,
    toolLocked: false,
    elements: [],
    activeElementId: null,
    editingElementId: null,
    actionHistory: [],
    redoHistory: [],
    pageTurns: {},
    documentRevision: 0,
    carried: {},
    appStyle: {},
  };

  it('SET_TOOL sets selectedTool', () => {
    const action = { type: 'SET_TOOL', payload: 'text' } satisfies SignToolAction;
    const nextState = reducer(initialState, action);
    expect(nextState.selectedTool).toBe('text');
  });

  // SIGN-33 (folding SIGN-32's carriedFont/carriedFontSize/carriedDirection
  // into one carried style object): one carried style per document,
  // belonging to the document (round-tripped through its draft), never the
  // browser.
  describe('carried style', () => {
    it('SET_CARRIED merges a partial patch into carried and bumps documentRevision', () => {
      const fontState = reducer(initialState, { type: 'SET_CARRIED', payload: { font: 'David' } });
      expect(fontState.carried.font).toBe('David');
      expect(fontState.documentRevision).toBe(1);

      const sizeState = reducer(fontState, { type: 'SET_CARRIED', payload: { fontSize: 18 } });
      expect(sizeState.carried.fontSize).toBe(18);
      expect(sizeState.documentRevision).toBe(2);
      // Setting one key never disturbs another already carried.
      expect(sizeState.carried.font).toBe('David');

      // A single patch can set several keys at once too.
      const multiState = reducer(sizeState, { type: 'SET_CARRIED', payload: { direction: 'rtl', color: '#ff0000' } });
      expect(multiState.carried).toEqual({ font: 'David', fontSize: 18, direction: 'rtl', color: '#ff0000' });
      expect(multiState.documentRevision).toBe(3);
    });

    it('LOAD_DOCUMENT restores a draft\'s carried style', () => {
      const loaded = reducer(initialState, {
        type: 'LOAD_DOCUMENT',
        payload: { elements: [], actionHistory: [], carried: { font: 'David', fontSize: 18, direction: 'rtl' } },
      });
      expect(loaded.carried).toEqual({ font: 'David', fontSize: 18, direction: 'rtl' });
    });

    it('LOAD_DOCUMENT resets to {} for a fresh document, even one opened after a document that carried style', () => {
      const withCarry = reducer(initialState, { type: 'SET_CARRIED', payload: { fontSize: 18 } });
      expect(withCarry.carried.fontSize).toBe(18);

      const fresh = reducer(withCarry, { type: 'LOAD_DOCUMENT', payload: { elements: [], actionHistory: [] } });
      expect(fresh.carried).toEqual({});
    });

    it('LOAD_DOCUMENT resets to {} for a draft written before this existed (carried absent or null)', () => {
      const withCarry = reducer(initialState, { type: 'SET_CARRIED', payload: { fontSize: 18 } });
      const restoredAbsent = reducer(withCarry, {
        type: 'LOAD_DOCUMENT',
        payload: { elements: [], actionHistory: [] },
      });
      expect(restoredAbsent.carried).toEqual({});

      const restoredNull = reducer(withCarry, {
        type: 'LOAD_DOCUMENT',
        payload: { elements: [], actionHistory: [], carried: null },
      });
      expect(restoredNull.carried).toEqual({});
    });
  });

  // SIGN-35: the app-wide style is a separate, non-document layer - it is
  // read again on every LOAD_DOCUMENT (unlike `carried`, it is never reset)
  // and merging into it is never a document edit.
  describe('app-wide style', () => {
    it('SET_APP_STYLE merges a partial patch into appStyle and does not bump documentRevision', () => {
      const withColor = reducer(initialState, { type: 'SET_APP_STYLE', payload: { color: '#000000' } });
      expect(withColor.appStyle).toEqual({ color: '#000000' });
      expect(withColor.documentRevision).toBe(0);

      const withFont = reducer(withColor, { type: 'SET_APP_STYLE', payload: { font: 'David' } });
      expect(withFont.appStyle).toEqual({ color: '#000000', font: 'David' });
      expect(withFont.documentRevision).toBe(0);
    });

    it('LOAD_DOCUMENT with an appStyle payload replaces it', () => {
      const withStyle = reducer(initialState, { type: 'SET_APP_STYLE', payload: { color: '#000000' } });
      const loaded = reducer(withStyle, {
        type: 'LOAD_DOCUMENT',
        payload: { elements: [], actionHistory: [], appStyle: { color: '#0000ff' } },
      });
      expect(loaded.appStyle).toEqual({ color: '#0000ff' });
    });

    it('LOAD_DOCUMENT without an appStyle payload keeps whatever is already loaded', () => {
      const withStyle = reducer(initialState, { type: 'SET_APP_STYLE', payload: { color: '#000000' } });
      const loaded = reducer(withStyle, { type: 'LOAD_DOCUMENT', payload: { elements: [], actionHistory: [] } });
      expect(loaded.appStyle).toEqual({ color: '#000000' });
      // `carried` still resets to {} on the very same load - the two layers
      // are independent.
      expect(loaded.carried).toEqual({});
    });
  });

  describe('CLEAR_PAGE', () => {
    it('removes only the elements on the given page', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [
          textElement('el-1'),
          rectangleElement('el-2', { pageIndex: 1 }),
          { id: 'el-3', type: 'signature', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, dataUrl: 'data:image/png;base64,test' }
        ]
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState.elements).toHaveLength(1);
      expect(nextState.elements[0].id).toBe('el-2');
    });

    it('drops the selection when the active element was on the cleared page', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [textElement('el-1')],
        activeElementId: 'el-1',
        editingElementId: 'el-1'
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState.activeElementId).toBeNull();
      expect(nextState.editingElementId).toBeNull();
    });

    it('leaves the selection untouched when the active element is on a different page', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [
          textElement('el-1'),
          textElement('el-2', { pageIndex: 1 })
        ],
        activeElementId: 'el-2'
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState.activeElementId).toBe('el-2');
      expect(nextState.elements).toHaveLength(1);
    });

    it('is a no-op when the page has nothing on it', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [textElement('el-1', { pageIndex: 1 })]
      };
      const nextState = reducer(state, { type: 'CLEAR_PAGE', payload: 0 });
      expect(nextState).toBe(state);
    });
  });

  describe('ENSURE_MINIMUM_SIZE', () => {
    it('does not modify non-matching elements', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [rectangleElement('el-1', { width: 0.1, height: 0.1 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-2', tool: 'rectangle', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      expect((nextState.elements[0] as RectangleElement).width).toBe(0.1);
    });

    it('resizes tiny lines to minimum size (diagonal < 1)', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [lineElement('el-1', { x1: 50, y1: 50, x2: 50.2, y2: 50.2 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'line', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      const element = nextState.elements[0] as LineElement;
      expect(element.x1).toBe(44); // 50 - 6
      expect(element.x2).toBe(56); // 50 + 6
      expect(element.y1).toBe(50);
      expect(element.y2).toBe(50);
    });

    it('does not resize lines if already large enough (diagonal >= 1)', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [lineElement('el-1', { x1: 50, y1: 50, x2: 52, y2: 52 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'line', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      expect((nextState.elements[0] as LineElement).x2).toBe(52);
    });

    it('resizes tiny whiteout box to default minimum dimensions', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [whiteoutElement('el-1', { left: 50, top: 50, width: 0.1, height: 0.1 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'whiteout', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      const el = nextState.elements[0] as WhiteoutElement;
      expect(el.width).toBe(10);
      expect(el.height).toBe(4);
      expect(el.left).toBe(45); // 50 - 5
      expect(el.top).toBe(48);  // 50 - 2
    });

    it('resizes tiny shape box to responsive size based on container dimensions', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [rectangleElement('el-1', { left: 50, top: 50, width: 0.1, height: 0.1 })]
      };
      // defW = 8, defH = widthPercentToHeightPercent(8, 1, 100, 200) = 8 * 1 * (100 / 200) = 4
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'rectangle', rectWidth: 100, rectHeight: 200, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      const el = nextState.elements[0] as RectangleElement;
      expect(el.width).toBe(8);
      expect(el.height).toBe(4);
      expect(el.left).toBe(46); // 50 - 8/2
      expect(el.top).toBe(48); // 50 - 4/2
    });

    it('does not resize shapes if width or height are large enough', () => {
      const state: SignToolState = {
        ...initialState,
        elements: [rectangleElement('el-1', { left: 50, top: 50, width: 5, height: 0.1 })]
      };
      const action = {
        type: 'ENSURE_MINIMUM_SIZE',
        payload: { id: 'el-1', tool: 'rectangle', rectWidth: 100, rectHeight: 100, startLeftPercent: 50, startTopPercent: 50 }
      } satisfies SignToolAction;
      const nextState = reducer(state, action);
      expect((nextState.elements[0] as RectangleElement).width).toBe(5);
    });
  });
});

describe('ROTATE_PAGE (SIGN-43)', () => {
  const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });
  const base: SignToolState = {
    selectedTool: null, toolLocked: false, elements: [], activeElementId: null, editingElementId: null,
    actionHistory: [], redoHistory: [], pageTurns: {}, documentRevision: 3, carried: {}, appStyle: {},
  };
  const onPage0 = rectangleElement('a', { left: 10, top: 20, width: 30, height: 10 });
  const onPage1 = rectangleElement('b', { pageIndex: 1, left: 10, top: 20, width: 30, height: 10 });
  const start: SignToolState = { ...base, elements: [onPage0, onPage1] };
  const rotate = (state: SignToolState) => reducer(state, { type: 'ROTATE_PAGE', payload: { pageIndex: 0, geometry } });
  const near = (a: EditorElement, b: EditorElement) => {
    const numbers = (e: EditorElement) => new Map(
      Object.entries(e).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
    );
    for (const key of ['left', 'top', 'width', 'height']) {
      expect(numbers(a).get(key)).toBeCloseTo(numbers(b).get(key) ?? NaN, 9);
    }
  };

  it('turns only that page, records the turn and one history entry, and bumps the revision', () => {
    const next = rotate(start);
    expect(next.pageTurns).toEqual({ 0: 1 });
    expect(next.elements[0]).toEqual(turnElement(onPage0, geometry, 1));
    expect(next.elements[0]).not.toEqual(onPage0);
    expect(next.elements[1]).toBe(onPage1);
    expect(next.actionHistory).toHaveLength(1);
    expect(next.actionHistory[0]).toMatchObject({ operation: 'turn-page', type: 'ROTATE_PAGE', pageIndex: 0, geometry });
    expect(next.actionHistory[0].description).toBe('Rotated page 1');
    expect(next.documentRevision).toBe(4);
  });

  it('clears redo and the selection', () => {
    const next = rotate({ ...start, activeElementId: 'a', editingElementId: 'a', redoHistory: [{ id: 'r', type: 'X', operation: 'delete', pageIndex: 0, description: '', timestamp: 0, elements: [] }] });
    expect(next.redoHistory).toEqual([]);
    expect(next.activeElementId).toBeNull();
    expect(next.editingElementId).toBeNull();
  });

  it('UNDO restores the elements and pageTurns, REDO re-applies the turn', () => {
    const turned = rotate(start);
    const undone = reducer(turned, { type: 'UNDO' });
    expect(undone.pageTurns).toEqual({});
    near(undone.elements[0], onPage0);
    expect(undone.elements[1]).toBe(onPage1);
    expect(undone.actionHistory).toEqual([]);
    expect(undone.redoHistory).toHaveLength(1);
    expect(undone.documentRevision).toBeGreaterThan(turned.documentRevision);

    const redone = reducer(undone, { type: 'REDO' });
    expect(redone.pageTurns).toEqual({ 0: 1 });
    near(redone.elements[0], turned.elements[0]);
    expect(redone.actionHistory).toHaveLength(1);
  });

  it('a half turn uses the measured text width, stores it, and undo restores the original anchor', () => {
    const t = textElement('t', { pageIndex: 0, left: 10, top: 20 });
    const withText: SignToolState = { ...base, elements: [t] };
    const press = (state: SignToolState) => reducer(state, {
      type: 'ROTATE_PAGE', payload: { pageIndex: 0, geometry, textWidths: { t: 30 } },
    });
    const once = press(withText);
    const twice = reducer(once, { type: 'ROTATE_PAGE', payload: { pageIndex: 0, geometry: createPageGeometry({ cropBox: geometry.cropBox, rotation: 90 }), textWidths: { t: 30 * geometry.width / geometry.height } } });
    expect(once.actionHistory[0]).toMatchObject({ textWidths: { t: 30 } });
    expect(twice.pageTurns).toEqual({ 0: 2 });
    const back = reducer(reducer(twice, { type: 'UNDO' }), { type: 'UNDO' });
    expect((back.elements[0] as TextElement).left).toBeCloseTo(10, 9);
    expect((back.elements[0] as TextElement).top).toBeCloseTo(20, 9);
  });

  it('LOAD_DOCUMENT carries pageTurns and defaults to {}', () => {
    const payload = { elements: [], actionHistory: [] };
    expect(reducer(start, { type: 'LOAD_DOCUMENT', payload: { ...payload, pageTurns: { 2: 3 } } }).pageTurns).toEqual({ 2: 3 });
    expect(reducer({ ...start, pageTurns: { 0: 1 } }, { type: 'LOAD_DOCUMENT', payload }).pageTurns).toEqual({});
  });
});

describe('Sign delegates the shared element cases to elementsReducer (READ-03)', () => {
  const entry = addHistory('act-1', 'ADD_TEXT', textElement('el-1'));
  const base: SignToolState = {
    ...initialElementsState,
    selectedTool: null, toolLocked: false, pageTurns: {}, carried: {}, appStyle: {},
    documentRevision: 5,
    elements: [textElement('el-1'), rectangleElement('el-2')],
    activeElementId: 'el-1',
    editingElementId: 'el-1',
    actionHistory: [entry],
  };
  const undone = reducer(base, { type: 'UNDO' });
  const cases: [ElementsAction, SignToolState][] = [
    [{ type: 'LOAD_DOCUMENT', payload: { elements: [textElement('el-3')], actionHistory: [entry] } }, base],
    [{ type: 'SET_ELEMENTS', payload: [textElement('el-3')] }, base],
    [{ type: 'ADD_ELEMENT', payload: textElement('el-3') }, base],
    [{ type: 'UPDATE_ELEMENT', payload: { id: 'el-1', changes: { text: 'Changed' } } }, base],
    [{ type: 'DELETE_ELEMENT', payload: 'el-1' }, base],
    [{ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'el-2' }, base],
    [{ type: 'SET_EDITING_ELEMENT_ID', payload: 'el-1' }, base],
    [{ type: 'ADD_ACTION_HISTORY', payload: addHistory('act-2', 'ADD_SHAPE', rectangleElement('el-2'), 1) }, base],
    [{ type: 'UNDO' }, base],
    [{ type: 'REDO' }, undone],
  ];

  it.each(cases)('%j matches elementsReducer on the shared fields', (action, state) => {
    const sign = reducer(state, action);
    const shared = elementsReducer(state, action);
    for (const key of Object.keys(shared) as (keyof ElementsState)[]) {
      expect(sign[key]).toEqual(shared[key]);
    }
  });

  it('CLEAR_PAGE clears the redo future', () => {
    expect(reducer({ ...undone, elements: [textElement('el-1')] }, { type: 'CLEAR_PAGE', payload: 0 }).redoHistory).toEqual([]);
  });
});

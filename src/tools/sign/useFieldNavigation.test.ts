/**
 * useFieldNavigation – unit tests
 *
 * Pure-logic, like useFormFieldRegions.ts's other use*.test.js siblings
 * (vitest.config.js's DOM_TESTS comment) - `bringFieldIntoView` guards for a
 * missing `document`, so the hook needs no jsdom to exercise its own new
 * responsibility: turning a field position into the right dispatch sequence.
 * fieldOrder.test.ts already covers the ordering math (`orderTypableFields`,
 * `fieldPosition`) directly; these tests instead call the hook the way
 * PdfWorkspace does - fresh each render, off whatever `elements`/
 * `activeElementId` it is handed - to prove the wiring on top of that math.
 */
import { describe, it, expect, vi } from 'vitest';
import useFieldNavigation from './useFieldNavigation.ts';
import type { CombRegion, FieldRegion } from '../../editor/text/combPlacement.ts';
import type { EditorElement, TextDirection, TextElement } from '../../editor/model/editorModel.ts';
import type { FormFieldRegions } from './useFormFieldRegions.ts';

const comb = (pageIndex: number, left: number, top: number, width = 15, cells = 9): CombRegion => (
  { pageIndex, left, top, width, height: 0.84, cells }
);
const cell = (pageIndex: number, left: number, top: number, width = 20): FieldRegion => (
  { pageIndex, left, top, width, height: 1.6 }
);

const rowRight = comb(0, 70, 20); // rightmost - first on an RTL page
const rowLeft = comb(0, 20, 20);
const emptyRegions: FormFieldRegions = { combs: [], checkboxes: [], cells: [], pageDirections: [] };

function makeHook(overrides: Partial<Parameters<typeof useFieldNavigation>[0]> = {}) {
  const dispatch = vi.fn();
  const logAction = vi.fn();
  const setAnnouncement = vi.fn();
  const nav = useFieldNavigation({
    elements: [],
    activeElementId: null,
    dispatch,
    formRegions: emptyRegions,
    logAction,
    setAnnouncement,
    ...overrides,
  });
  return { dispatch, logAction, setAnnouncement, ...nav };
}

function addedElement(dispatch: ReturnType<typeof vi.fn>): EditorElement {
  const call = dispatch.mock.calls.find(([action]) => action.type === 'ADD_ELEMENT');
  if (!call) throw new Error('no ADD_ELEMENT was dispatched');
  return call[0].payload;
}

describe('useFieldNavigation – nothing detected', () => {
  it('has nowhere to go and dispatches nothing', () => {
    const { hasFields, hasNext, hasPrevious, goToNext, goToPrevious, dispatch } = makeHook();
    expect(hasFields).toBe(false);
    expect(hasNext).toBe(false);
    expect(hasPrevious).toBe(false);
    goToNext();
    goToPrevious();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('useFieldNavigation – creating a box on an empty field', () => {
  const formRegions: FormFieldRegions = { combs: [rowRight, rowLeft], checkboxes: [], cells: [], pageDirections: ['rtl'] };

  it('reports hasFields whenever the document has any, regardless of the current position', () => {
    expect(makeHook({ formRegions }).hasFields).toBe(true);
    // Session-durable: still true once standing on the only reachable field,
    // where hasNext/hasPrevious themselves may be false - the toolbar control
    // must not unmount there, only grey its buttons out. Reuses rowRight
    // (order[0]) as the sole detected field, so being "on" it means being at
    // both ends of the order at once.
    const solo: FormFieldRegions = { combs: [rowRight], checkboxes: [], cells: [], pageDirections: ['rtl'] };
    const onlyField: TextElement = { id: 'e', type: 'text', pageIndex: 0, left: 70, top: 19.5, text: '' };
    const nav = makeHook({ formRegions: solo, elements: [onlyField], activeElementId: 'e' });
    expect(nav.hasFields).toBe(true);
    expect(nav.hasNext).toBe(false);
    expect(nav.hasPrevious).toBe(false);
  });

  it('Next with nothing selected creates a box on the first field in reading order (RTL: rightmost)', () => {
    const { goToNext, dispatch, logAction, setAnnouncement } = makeHook({ formRegions });
    goToNext();
    const el = addedElement(dispatch);
    expect(el).toMatchObject({ type: 'text', left: 70, width: 15, combCells: 9 });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: el.id });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EDITING_ELEMENT_ID', payload: el.id });
    expect(logAction).toHaveBeenCalledTimes(1);
    expect(setAnnouncement).toHaveBeenCalledWith(expect.stringContaining('9'));
  });

  it('Previous with nothing selected creates a box on the last field in reading order (RTL: leftmost)', () => {
    const { goToPrevious, dispatch, setAnnouncement } = makeHook({ formRegions });
    goToPrevious();
    const el = addedElement(dispatch);
    expect(el).toMatchObject({ type: 'text', left: 20 });
    expect(setAnnouncement).toHaveBeenCalledWith(expect.stringContaining('printed boxes'));
  });

  it('creates the box the same way a tap on a free-text cell would: minWidth, no comb fields', () => {
    const soloCell = cell(0, 55, 33.2);
    const { goToNext, dispatch, setAnnouncement } = makeHook({
      formRegions: { combs: [], checkboxes: [], cells: [soloCell], pageDirections: ['ltr'] },
    });
    goToNext();
    const el = addedElement(dispatch) as TextElement;
    expect(el.minWidth).toBe(soloCell.width);
    expect(el.width).toBeUndefined();
    expect(el.combCells).toBeUndefined();
    expect(setAnnouncement).toHaveBeenCalledWith(expect.not.stringContaining('printed boxes'));
  });

  it('creates a fresh field starting LTR, same as a tap does, regardless of the page direction', () => {
    const { goToNext, dispatch } = makeHook({ formRegions });
    goToNext();
    const el = addedElement(dispatch) as TextElement;
    expect(el.textDirection).toBe('ltr');
  });

  it('applies the given font/size/color, same knobs useWorkspaceGestures exposes', () => {
    const { goToNext, dispatch } = makeHook({
      formRegions,
      initialColor: '#ff3300',
      initialFont: 'Noto Sans Hebrew',
      initialFontSize: 18,
    });
    goToNext();
    const el = addedElement(dispatch) as TextElement;
    expect(el.color).toBe('#ff3300');
    expect(el.fontFamily).toBe('Noto Sans Hebrew');
  });
});

describe('useFieldNavigation – landing on a field that already has a box', () => {
  const formRegions: FormFieldRegions = { combs: [rowRight, rowLeft], checkboxes: [], cells: [], pageDirections: ['rtl'] };
  // Sits on rowRight (left 70, top 20) - the first field an RTL page's Next
  // reaches with nothing selected. elementIsOnField's tolerance is generous
  // enough that the box placeCombOnRegion would itself produce also matches.
  const existing: TextElement = {
    id: 'existing-1', type: 'text', pageIndex: 0, left: 70, top: 19.5, text: 'hi', fontSize: 12,
  };

  it('selects and opens it instead of creating a second box', () => {
    const { goToNext, dispatch, setAnnouncement } = makeHook({
      formRegions,
      elements: [existing],
    });
    goToNext();
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'existing-1' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EDITING_ELEMENT_ID', payload: 'existing-1' });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ADD_ELEMENT' }));
    expect(setAnnouncement).toHaveBeenCalledWith(expect.stringContaining('next field'));
  });

  it('never matches a non-text element sitting in the same spot (e.g. a signature)', () => {
    const signature = { id: 'sig-1', type: 'signature', pageIndex: 0, left: 70, top: 19.5, width: 10, height: 5, dataUrl: 'x' } as unknown as EditorElement;
    const { goToNext, dispatch } = makeHook({ formRegions, elements: [signature] });
    goToNext();
    expect(addedElement(dispatch)).toMatchObject({ type: 'text', left: 70 });
  });
});

describe('useFieldNavigation – walking forward across renders', () => {
  it('advances from the field just created to the next one, the way PdfWorkspace re-renders it', () => {
    const formRegions: FormFieldRegions = { combs: [rowRight, rowLeft], checkboxes: [], cells: [], pageDirections: ['rtl'] };
    let elements: EditorElement[] = [];
    let activeElementId: string | null = null;
    const dispatch = vi.fn((action: { type: string; payload: unknown }) => {
      if (action.type === 'ADD_ELEMENT') elements = [...elements, action.payload as EditorElement];
      if (action.type === 'SET_ACTIVE_ELEMENT_ID') activeElementId = action.payload as string | null;
    });
    const logAction = vi.fn();
    const setAnnouncement = vi.fn();

    const first = useFieldNavigation({ elements, activeElementId, dispatch, formRegions, logAction, setAnnouncement });
    expect(first.hasPrevious).toBe(true); // nothing selected: Previous starts at the last field
    first.goToNext();
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({ left: 70 });
    expect(activeElementId).toBe(elements[0].id);

    const second = useFieldNavigation({ elements, activeElementId, dispatch, formRegions, logAction, setAnnouncement });
    expect(second.hasNext).toBe(true);
    expect(second.hasPrevious).toBe(false);
    second.goToNext();
    expect(elements).toHaveLength(2);
    expect(elements[1]).toMatchObject({ left: 20 });

    const third = useFieldNavigation({ elements, activeElementId, dispatch, formRegions, logAction, setAnnouncement });
    expect(third.hasNext).toBe(false);
    third.goToNext();
    expect(elements).toHaveLength(2); // no third field to advance to - no-op
  });
});

describe('useFieldNavigation – direction-aware ordering', () => {
  it('an LTR page visits the leftmost field first, unlike the RTL fixtures above', () => {
    const formRegions: FormFieldRegions = { combs: [rowRight, rowLeft], checkboxes: [], cells: [], pageDirections: ['ltr' as TextDirection] };
    const { goToNext, dispatch } = makeHook({ formRegions });
    goToNext();
    expect(addedElement(dispatch)).toMatchObject({ left: 20 });
  });
});

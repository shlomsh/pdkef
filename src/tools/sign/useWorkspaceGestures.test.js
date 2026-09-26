/**
 * useWorkspaceGestures – unit tests
 *
 * These tests verify that every "remembered" user preference (color, stroke
 * width, font family, font size, text direction) is correctly applied to newly
 * created elements. They act as a regression net for the class of bugs where a
 * hardcoded default silently overrides the user's last selection.
 *
 * Strategy: call the hook directly (it is a plain function, not a component),
 * then exercise the returned handlers the same way the DOM would – by
 * constructing synthetic event objects with getBoundingClientRect stubs so the
 * coordinate math resolves predictably.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useWorkspaceGestures from './useWorkspaceGestures.js';
import { DEFAULT_SYMBOL_WIDTH_PCT } from '../../constants/signGeometry.js';
import { formatDate, toIsoDateString } from '../../editor/text/dateFormat.ts';
import { startGesture } from '../../lib/gestures/controller.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Synthetic overlay element with a known bounding rect. */
function makeOverlay({ left = 0, top = 0, width = 1000, height = 1000 } = {}) {
  return {
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
    closest: () => null,
    querySelectorAll: () => [],
  };
}

/**
 * Builds the minimal synthetic event that handlePageClick / handleOverlayPointerDown
 * expect for a mouse interaction.
 */
function makeClickEvent(clientX, clientY, overlay) {
  return {
    clientX,
    clientY,
    currentTarget: overlay,
    target: { closest: () => null, tagName: 'DIV' },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    touches: null,
  };
}

function makeMouseDownEvent(clientX, clientY, overlay) {
  return {
    clientX,
    clientY,
    currentTarget: overlay,
    target: { closest: () => null, tagName: 'DIV' },
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    touches: null,
  };
}

/** Extract the first ADD_ELEMENT payload dispatched. */
function firstAddElement(dispatch) {
  const call = dispatch.mock.calls.find(([action]) => action.type === 'ADD_ELEMENT');
  return call ? call[0].payload : null;
}

// ---------------------------------------------------------------------------
// Default helpers used across tests
// ---------------------------------------------------------------------------

// SIGN-33 folded the hook's three flat carriedFont/carriedFontSize/
// carriedDirection props into one `carried` object. Every test below still
// passes the flat, pre-SIGN-33 names (deliberately - that is what reads as
// "the remembered font", "the remembered size", "the remembered direction");
// this helper is the one place that translates them into the shape the hook
// actually takes now, so no single test had to be rewritten to know about
// `carried` at all. A test that already knows to pass `carried` directly
// (none do yet) still works: it wins over any flat key alongside it.
function makeHook({ carriedFont, carriedFontSize, carriedDirection, carried, ...overrides } = {}) {
  const dispatch = vi.fn();
  const mergedCarried = {
    ...(carriedFont !== undefined ? { font: carriedFont ?? undefined } : {}),
    ...(carriedFontSize !== undefined ? { fontSize: carriedFontSize ?? undefined } : {}),
    ...(carriedDirection !== undefined ? { direction: carriedDirection ?? undefined } : {}),
    ...carried,
  };
  const hook = useWorkspaceGestures({
    selectedTool: overrides.selectedTool ?? 'text',
    dispatch,
    activeSignature: null,
    setTempPlacement: vi.fn(),
    setDialogOpen: vi.fn(),
    placeSignatureAt: vi.fn(),
    logAction: vi.fn(),
    setAnnouncement: vi.fn(),
    ...overrides,
    carried: mergedCarried,
  });
  return { dispatch, ...hook };
}

// ---------------------------------------------------------------------------
// Text element — click-placement
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures – text element remembered settings', () => {
  const overlay = makeOverlay();

  it('applies the default color (#1463ff) when no initialColor is provided', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ type: 'text', color: '#1463ff' });
  });

  it('applies a custom initialColor to new text elements', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialColor: '#ff3300',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ type: 'text', color: '#ff3300' });
  });

  it('applies the default font (Arimo) when no carriedFont is provided', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontFamily: 'Arimo' });
  });

  it('applies a custom carriedFont to new text elements', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFont: 'Noto Sans Hebrew',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontFamily: 'Noto Sans Hebrew' });
  });

  it('applies the default fontSize (12) when no carriedFontSize is provided', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontSize: 12 });
  });

  it('applies a custom carriedFontSize to new text elements', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFontSize: 24,
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontSize: 24 });
  });

  it('does NOT set textDirection when carriedDirection is null (auto-detect)', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedDirection: null,
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el).not.toHaveProperty('textDirection');
  });

  it('sets textDirection to "rtl" when the user previously chose RTL', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedDirection: 'rtl',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ textDirection: 'rtl' });
  });

  it('sets textDirection to "ltr" when the user previously chose LTR explicitly', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedDirection: 'ltr',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ textDirection: 'ltr' });
  });

  it('applies all remembered text settings together', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialColor: '#123456',
      carriedFont: 'David',
      carriedFontSize: 18,
      carriedDirection: 'rtl',
    });
    handlePageClick(makeClickEvent(200, 300, overlay), 2);
    expect(firstAddElement(dispatch)).toMatchObject({
      type: 'text',
      pageIndex: 2,
      color: '#123456',
      fontFamily: 'David',
      fontSize: 18,
      textDirection: 'rtl',
    });
  });

  // The click point is the middle of the box's anchored edge (its left edge in
  // LTR, its right edge in RTL), so the caret lands where the user pointed
  // instead of the box hanging below the pointer.
  it('centers a new text box vertically on the click point', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFontSize: 12,
      pageSizes: [{ width: 612, height: 792 }],
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    // Box height = 12pt * (1.05 + 2*0.12) em / 792pt of page = ~1.955% of the page.
    const expectedHeight = (12 * 1.29 / 792) * 100;
    expect(el.left).toBeCloseTo(50, 5);
    expect(el.top).toBeCloseTo(50 - expectedHeight / 2, 5);
  });

  it('scales the vertical centering with the remembered font size', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFontSize: 48,
      pageSizes: [{ width: 612, height: 792 }],
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch).top).toBeCloseTo(50 - (48 * 1.29 / 792) * 100 / 2, 5);
  });

  it('never places a text box above the top of the page', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFontSize: 48,
      pageSizes: [{ width: 612, height: 792 }],
    });
    // Click 1px from the top: half the box would sit off-page.
    handlePageClick(makeClickEvent(500, 1, overlay), 0);
    expect(firstAddElement(dispatch).top).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Symbol element — click-placement
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures – symbol remembered settings', () => {
  const overlay = makeOverlay();

  it('applies the current remembered color and default check mark to new symbols', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'symbol',
      initialColor: '#111111',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({
      type: 'symbol',
      mark: 'check',
      color: '#111111',
    });
  });

  it('sizes a new symbol from the last remembered symbol width, centered on the click', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'symbol',
      initialSymbolWidth: 12,
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el.width).toBe(12);
    // Square aspect ratio on a square page: height matches width.
    expect(el.height).toBeCloseTo(12, 5);
    expect(el.left).toBeCloseTo(50 - 6, 5);
    expect(el.top).toBeCloseTo(50 - 6, 5);
  });

  it('falls back to the default symbol width when nothing has been remembered yet', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'symbol' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch).width).toBe(DEFAULT_SYMBOL_WIDTH_PCT);
  });

  it('applies the last remembered mark to a new symbol, not always a check mark', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'symbol',
      initialSymbolMark: 'x',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ type: 'symbol', mark: 'x' });
  });

  it('removes an existing mark when tapping its detected checkbox again', () => {
    const checkbox = { pageIndex: 0, left: 49, top: 49, width: 2, height: 2 };
    const existing = {
      id: 'checked-box', type: 'symbol', pageIndex: 0,
      // The check's ink centre is at the box centre (50%, 50%); its element
      // box intentionally extends beyond the printed square.
      left: 48, top: 48.0833333333, width: 4, height: 4,
      mark: 'check', color: '#1463ff',
    };
    const logAction = vi.fn();
    const setAnnouncement = vi.fn();
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'symbol',
      formRegions: { combs: [], checkboxes: [checkbox] },
      elements: [existing],
      logAction,
      setAnnouncement,
    });

    handlePageClick(makeClickEvent(500, 500, overlay), 0);

    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_ELEMENT', payload: existing.id });
    expect(dispatch.mock.calls.some(([action]) => action.type === 'ADD_ELEMENT')).toBe(false);
    expect(logAction).toHaveBeenCalledWith(
      'delete', 'DELETE_ELEMENT', 0, 'Removed symbol from printed box',
      [{ element: existing, index: 0 }],
    );
    expect(setAnnouncement).toHaveBeenCalledWith('Removed symbol from the printed box.');
  });

  // Fill mode (SNG-15): nothing armed, a tap on a detected box runs this same
  // path through toolOverride, at the box's centre.
  it('places a mark in an empty detected box through the symbol override with nothing armed', () => {
    const checkbox = { pageIndex: 0, left: 49, top: 49, width: 2, height: 2 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: null,
      formRegions: { combs: [], checkboxes: [checkbox] },
    });
    // The tap landed on a neighbouring mark's handle; fill mode already resolved it.
    const event = { ...makeClickEvent(500, 500, overlay), target: { closest: () => ({}), tagName: 'DIV' } };

    handlePageClick(event, 0, { x: 50, y: 50 }, 'symbol');

    expect(firstAddElement(dispatch)).toMatchObject({ type: 'symbol', pageIndex: 0 });
  });

  // SNG-15 finding 1: a touchend that fill mode already resolved (a corrected point,
  // toolOverride) must not stopPropagation, or the gesture controller
  // (src/lib/gestures/controller.ts) listening for touchend on window never sees it, and
  // a drag or resize that began on the element's own touchstart never finishes.
  it('places a mark from a touchend event without calling stopPropagation', () => {
    const checkbox = { pageIndex: 0, left: 49, top: 49, width: 2, height: 2 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: null,
      formRegions: { combs: [], checkboxes: [checkbox] },
    });
    const event = { ...makeClickEvent(500, 500, overlay), type: 'touchend' };

    handlePageClick(event, 0, { x: 50, y: 50 }, 'symbol');

    expect(firstAddElement(dispatch)).toMatchObject({ type: 'symbol', pageIndex: 0 });
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('removes an existing mark from a touchend event without calling stopPropagation', () => {
    const checkbox = { pageIndex: 0, left: 49, top: 49, width: 2, height: 2 };
    const existing = {
      id: 'checked-box', type: 'symbol', pageIndex: 0,
      left: 48, top: 48.0833333333, width: 4, height: 4,
      mark: 'check', color: '#1463ff',
    };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'symbol',
      formRegions: { combs: [], checkboxes: [checkbox] },
      elements: [existing],
    });
    const event = { ...makeClickEvent(500, 500, overlay), type: 'touchend' };

    handlePageClick(event, 0);

    expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_ELEMENT', payload: existing.id });
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('places a mark from an ordinary click event and still calls stopPropagation', () => {
    const checkbox = { pageIndex: 0, left: 49, top: 49, width: 2, height: 2 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: null,
      formRegions: { combs: [], checkboxes: [checkbox] },
    });
    const event = { ...makeClickEvent(500, 500, overlay), type: 'click' };

    handlePageClick(event, 0, { x: 50, y: 50 }, 'symbol');

    expect(firstAddElement(dispatch)).toMatchObject({ type: 'symbol', pageIndex: 0 });
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('still ignores a click on an element when no corrected point is given', () => {
    const checkbox = { pageIndex: 0, left: 49, top: 49, width: 2, height: 2 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'symbol',
      formRegions: { combs: [], checkboxes: [checkbox] },
    });
    const event = { ...makeClickEvent(500, 500, overlay), target: { closest: () => ({}), tagName: 'DIV' } };

    handlePageClick(event, 0);

    expect(dispatch.mock.calls.some(([action]) => action.type === 'ADD_ELEMENT')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MOBI-11 — free-text cells: snap the tap to the cell's span (minWidth), never `width`
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures – detected free-text cell snapping', () => {
  const overlay = makeOverlay();
  // A blank name cell covering the raw tap point (500, 500 = 50%/50%) but
  // off-centre within it, so a snap to the cell's own edge is
  // distinguishable from the box merely landing near the tap.
  const nameCell = { pageIndex: 0, left: 44, top: 44, width: 20, height: 20 };

  it('puts a new text box on the cell\'s left edge, spanning the cell, instead of at the raw tap point', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      formRegions: { combs: [], checkboxes: [], cells: [nameCell] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const added = firstAddElement(dispatch);
    // `left` is the box's left edge, so it goes on the cell's left edge - not
    // its middle (54), which used to hang the box's right half out over the
    // next column - and the cell's span becomes the box's minimum width, so
    // its right end lands on the cell's right edge too.
    expect(added.left).toBeCloseTo(nameCell.left, 5);
    expect(added.minWidth).toBeCloseTo(nameCell.width, 5);
    // top is the cell's vertical centre, minus half the box's own natural
    // height (the same textHeight/2 a raw tap at that point would use).
    expect(added.top).toBeGreaterThan(nameCell.top);
    expect(added.top).toBeLessThan(nameCell.top + nameCell.height);
  });

  it('places the box the same way whatever direction is predicted - the span has no anchored edge', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedDirection: 'rtl',
      formRegions: { combs: [], checkboxes: [], cells: [nameCell] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const added = firstAddElement(dispatch);
    expect(added.left).toBeCloseTo(nameCell.left, 5);
    expect(added.minWidth).toBeCloseTo(nameCell.width, 5);
    expect(added.textDirection).toBe('rtl');
  });

  it('takes the document\'s carried direction over the page\'s printed direction, once the document has one (SIGN-32 reopened)', () => {
    // The person is actively filling this document in the direction they
    // just typed in another field - a stronger, fresher signal than the
    // page's own printed convention, so it wins on every field placed after.
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedDirection: 'ltr',
      formRegions: { combs: [], checkboxes: [], cells: [nameCell], pageDirections: ['rtl'] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch).textDirection).toBe('ltr');
  });

  it('falls back to the page\'s printed direction when the document has nothing carried yet - a Hebrew form opens right-aligned', () => {
    // Reported live: on a Hebrew form, every field-spanned box opened with a
    // left-aligned cursor. The placeholder is English but the person types
    // their own language, and the page already says which way that reads -
    // this is only the fallback for a document with no carried direction of
    // its own (see the test above for once one exists).
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedDirection: null,
      formRegions: { combs: [], checkboxes: [], cells: [nameCell], pageDirections: ['rtl'] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch).textDirection).toBe('rtl');
  });

  it('leaves a free tap away from any field on the remembered direction - the page seed is for field-spanned boxes only', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedDirection: 'ltr',
      formRegions: { combs: [], checkboxes: [], cells: [], pageDirections: ['rtl'] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch).textDirection).toBe('ltr');
  });

  it('snaps to the cell under a corrected point (fill mode) instead of the click\'s own point', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      formRegions: { combs: [], checkboxes: [], cells: [nameCell] },
    });
    // The click lands far from the cell (10%, 10%); the corrected point is inside it.
    handlePageClick(makeClickEvent(100, 100, overlay), 0, { x: 50, y: 50 });
    const added = firstAddElement(dispatch);
    expect(added.left).toBeCloseTo(nameCell.left, 5);
    expect(added.minWidth).toBeCloseTo(nameCell.width, 5);
  });

  it('never sets width on the snapped element - a free-text cell is not a comb', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      formRegions: { combs: [], checkboxes: [], cells: [nameCell] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch).width).toBeUndefined();
  });

  it('shrinks the font on a short cell instead of overflowing into the row below (the e-ticket "Status" column)', () => {
    // 1% of the 792pt fallback page height (~7.92pt) - short enough that even
    // the 12pt default overflows it, let alone a remembered 24pt from a
    // previous, taller field.
    // Positioned to actually cover the raw tap point (500, 500 = 50%/50%),
    // unlike nameCell's generous 20%-tall box above.
    const statusCell = { pageIndex: 0, left: 44, top: 49.5, width: 12, height: 1 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFontSize: 24,
      formRegions: { combs: [], checkboxes: [], cells: [statusCell] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const added = firstAddElement(dispatch);
    expect(added.fontSize).toBeLessThan(24);
    // The box's own one-line height, in the same page-percent units as the
    // cell, must fit inside the row it was placed on.
    const boxHeightPercent = (added.fontSize * 1.29 / 792) * 100;
    expect(boxHeightPercent).toBeLessThanOrEqual(statusCell.height + 1e-9);
  });

  it('leaves an unsnapped text box exactly where tapped when no cell is under it', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch).left).toBeCloseTo(50, 5);
  });

  it('ignores a detected cell while the symbol tool is armed', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'symbol',
      formRegions: { combs: [], checkboxes: [], cells: [nameCell] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    // Not snapped to the cell's left edge (44): the symbol tool has its own
    // region (formRegions.checkboxes), and a detected free-text cell is never
    // a match for it.
    expect(firstAddElement(dispatch).left).not.toBeCloseTo(nameCell.left, 5);
  });
});

// ---------------------------------------------------------------------------
// Drag-drawn shapes — pointer-down placement
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures – drag-drawn shape remembered settings', () => {
  const overlay = makeOverlay();
  let listeners;

  beforeEach(() => {
    // handleOverlayPointerDown attaches window listeners — clean up after each test.
    listeners = {};
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener) => {
      listeners[type] = listener;
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
  });

  it.each(['rectangle', 'ellipse'])(
    '%s inherits initialColor from last remembered color',
    (toolType) => {
      const { dispatch, handleOverlayPointerDown } = makeHook({
        selectedTool: toolType,
        initialColor: '#abcdef',
        initialStrokeWidth: 5,
      });
      handleOverlayPointerDown(makeMouseDownEvent(100, 100, overlay), 0);
      expect(firstAddElement(dispatch)).toMatchObject({
        type: toolType,
        color: '#abcdef',
        strokeWidth: 5,
      });
    },
  );

  it('line inherits initialColor and initialStrokeWidth', () => {
    const { dispatch, handleOverlayPointerDown } = makeHook({
      selectedTool: 'line',
      initialColor: '#ff0077',
      initialStrokeWidth: 7,
    });
    handleOverlayPointerDown(makeMouseDownEvent(100, 100, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({
      type: 'line',
      color: '#ff0077',
      strokeWidth: 7,
    });
  });

  it('whiteout always uses white (#ffffff) regardless of initialColor', () => {
    const { dispatch, handleOverlayPointerDown } = makeHook({
      selectedTool: 'whiteout',
      initialColor: '#ff0000',
    });
    handleOverlayPointerDown(makeMouseDownEvent(100, 100, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({
      type: 'whiteout',
      color: '#ffffff',
    });
  });

  it('uses the default blue (#1463ff) for shapes when no initialColor is provided', () => {
    const { dispatch, handleOverlayPointerDown } = makeHook({
      selectedTool: 'rectangle',
    });
    handleOverlayPointerDown(makeMouseDownEvent(100, 100, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ color: '#1463ff' });
  });

  it('uses the default strokeWidth (3) for shapes when no initialStrokeWidth is provided', () => {
    const { dispatch, handleOverlayPointerDown } = makeHook({
      selectedTool: 'ellipse',
    });
    handleOverlayPointerDown(makeMouseDownEvent(100, 100, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ strokeWidth: 3 });
  });

  it('does not dispatch geometry updates during a draw, then commits once on release', () => {
    const { dispatch, handleOverlayPointerDown } = makeHook({ selectedTool: 'rectangle' });
    handleOverlayPointerDown(makeMouseDownEvent(100, 100, overlay), 0);

    listeners.mousemove(makeMouseDownEvent(300, 400, overlay));
    listeners.mousemove(makeMouseDownEvent(400, 500, overlay));

    expect(dispatch.mock.calls.filter(([action]) => action.type === 'UPDATE_ELEMENT')).toHaveLength(0);

    listeners.mouseup();

    const updates = dispatch.mock.calls.filter(([action]) => action.type === 'UPDATE_ELEMENT');
    expect(updates).toHaveLength(1);
    expect(updates[0][0].payload.changes).toEqual({ left: 10, top: 10, width: 30, height: 40 });
  });
});

// ---------------------------------------------------------------------------
// Coordinate mapping — page index, left%, top%
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures – coordinate placement', () => {
  it('maps clientX/Y to correct percent coordinates for text click', () => {
    // Overlay: left=100, top=200, 500x400
    const overlay = makeOverlay({ left: 100, top: 200, width: 500, height: 400 });
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });

    // Click at clientX=350, clientY=400 → relative x=250 (50%), y=200 (50%)
    handlePageClick(makeClickEvent(350, 400, overlay), 3);

    const el = firstAddElement(dispatch);
    expect(el.left).toBe(50);
    // Vertically centered on the click: half a 12pt box on a default-height
    // (792pt) page, since this overlay has no pageSizes entry.
    expect(el.top).toBeCloseTo(50 - (12 * 1.29 / 792) * 100 / 2, 5);
    expect(el.pageIndex).toBe(3);
  });

  it('no-ops when no tool is selected', () => {
    const overlay = makeOverlay();
    const { dispatch, handlePageClick } = makeHook({ selectedTool: null });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('no-ops handlePageClick for drag-drawn tools (rectangle)', () => {
    const overlay = makeOverlay();
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'rectangle' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('no-ops handleOverlayPointerDown for point-placement tools (text)', () => {
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    const overlay = makeOverlay();
    const { dispatch, handleOverlayPointerDown } = makeHook({ selectedTool: 'text' });
    handleOverlayPointerDown(makeMouseDownEvent(500, 500, overlay), 0);
    expect(dispatch).not.toHaveBeenCalled();
    window.addEventListener.mockRestore();
  });
});

describe('useWorkspaceGestures – date tool', () => {
  const overlay = makeOverlay();
  const todayIso = toIsoDateString(new Date());

  it('places an ordinary text element prefilled with today\'s date, in the locale format by default', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'date' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({
      type: 'text',
      text: formatDate(todayIso, 'locale'),
      dateFormatId: 'locale',
      dateValue: todayIso,
    });
  });

  it('prefills using a remembered initialDateFormat instead of the locale default', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'date', initialDateFormat: 'iso' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({
      text: todayIso,
      dateFormatId: 'iso',
    });
  });

  it('ignores a corrupt/unknown initialDateFormat and falls back to locale', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'date', initialDateFormat: 'not-a-real-format' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ dateFormatId: 'locale' });
  });

  it('applies the remembered color and font like an ordinary text box', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'date',
      initialColor: '#ff3300',
      carriedFont: 'Noto Sans Hebrew',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ color: '#ff3300', fontFamily: 'Noto Sans Hebrew' });
  });

  it('selects the placed date but does not open a typing session on it', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'date' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: expect.any(String) });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_EDITING_ELEMENT_ID' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'DISARM_TOOL' });
  });

  // MOBI-11: 'date' places an ordinary text element (see the definition
  // lookup in useWorkspaceGestures.ts), so it gets the same detected-field
  // snap as 'text' - a date written on a printed comb, or in a blank cell,
  // is exactly as common on these forms as a plain typed date.
  it('snaps to a detected comb run the same way the text tool does', () => {
    const dateRun = { pageIndex: 0, left: 40, top: 49, width: 15, height: 0.9, cells: 8 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'date',
      formRegions: { combs: [dateRun], checkboxes: [], cells: [] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const added = firstAddElement(dispatch);
    expect(added.left).toBeCloseTo(40, 5);
    expect(added.combCells).toBe(8);
    // 8 cells is DD|MM|YYYY with printed dividers: digits only, one per cell.
    expect(added).toMatchObject({ dateFormatId: 'dmyDigits', text: formatDate(todayIso, 'dmyDigits') });
  });

  it('uses MMDDYYYY on an 8-cell comb when the remembered format is month-first', () => {
    const dateRun = { pageIndex: 0, left: 40, top: 49, width: 15, height: 0.9, cells: 8 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'date',
      initialDateFormat: 'mdy',
      formRegions: { combs: [dateRun], checkboxes: [], cells: [] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ dateFormatId: 'mdyDigits', text: formatDate(todayIso, 'mdyDigits') });
  });

  it('keeps the remembered format on a comb run that is not 8 cells', () => {
    const shortRun = { pageIndex: 0, left: 40, top: 49, width: 15, height: 0.9, cells: 6 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'date',
      initialDateFormat: 'iso',
      formRegions: { combs: [shortRun], checkboxes: [], cells: [] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ dateFormatId: 'iso', text: todayIso });
  });

  it('fills a detected free-text cell the same way the text tool does', () => {
    const dateCell = { pageIndex: 0, left: 44, top: 44, width: 20, height: 20 };
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'date',
      formRegions: { combs: [], checkboxes: [], cells: [dateCell] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const added = firstAddElement(dispatch);
    expect(added.left).toBeCloseTo(dateCell.left, 5); // the cell's left edge, not its middle
    expect(added.minWidth).toBeCloseTo(dateCell.width, 5);
    expect(added.width).toBeUndefined(); // never a comb
    expect(added.text).toBe(formatDate(todayIso, 'locale'));
  });
});

// ---------------------------------------------------------------------------
// SIGN-32 — one carried font and size per document
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures – carried font/size (SIGN-32)', () => {
  const overlay = makeOverlay();
  // 20% of the 792pt fallback page (~158.4pt) - well past the ~21.5pt where
  // FIELD_FONT_MAX_PT's cap engages, so seeding from it lands on the cap
  // (14pt), not the field's own fill target.
  const tallCell = { pageIndex: 0, left: 44, top: 44, width: 20, height: 20 };
  // A comb whose cells are far narrower than a 20pt carried size at the
  // default 612pt-wide fallback page (~1.33% = 8.16pt per cell).
  const narrowComb = { pageIndex: 0, left: 44, top: 49, width: 12, height: 1, cells: 9 };

  it('seeds the carried size from DEFAULT_FONT_SIZE_PT on free text, with nothing carried yet', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el.fontSize).toBe(12);
    // SIGN-35: only the size seeds - seeding is not choosing.
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CARRIED', payload: { fontSize: 12 } });
  });

  it('seeds the carried size from a detected field\'s own height, not the default, on the first placement', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      formRegions: { combs: [], checkboxes: [], cells: [tallCell] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el.fontSize).toBe(14);
    // SIGN-35: only the size seeds, not the font.
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CARRIED', payload: { fontSize: 14 } });
  });

  it('carries an explicit font/size forward without re-seeding', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFont: 'David',
      carriedFontSize: 18,
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el).toMatchObject({ fontFamily: 'David', fontSize: 18 });
    expect(dispatch.mock.calls.some(([action]) => action.type === 'SET_CARRIED')).toBe(false);
  });

  it('shrinks a narrow comb only - the carried size itself is untouched, so the next field gets it back', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFontSize: 20,
      formRegions: { combs: [narrowComb], checkboxes: [], cells: [] },
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el.fontSize).toBeLessThan(20);
    // Nothing dispatched to change the carried size: a second placement in
    // the same click (simulated by a fresh hook with the same carriedFontSize)
    // would still start from 20, not from this comb's shrunk answer.
    expect(dispatch.mock.calls.some(([action]) => action.type === 'SET_CARRIED' && 'fontSize' in action.payload)).toBe(false);
  });

  it('never seeds the carried font/size from a symbol placement', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'symbol' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(dispatch.mock.calls.some(([action]) => action.type === 'SET_CARRIED')).toBe(false);
  });

  it('never seeds when a tap on an existing element short-circuits placement', () => {
    const targetEl = { closest: (selector) => (selector === '[data-editor-element]' ? {} : null) };
    const event = { ...makeClickEvent(500, 500, overlay), target: targetEl };
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(event, 0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('SIGN-35: with nothing carried, the placement\'s SET_CARRIED carries no font', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const carriedCalls = dispatch.mock.calls.filter(([action]) => action.type === 'SET_CARRIED');
    expect(carriedCalls.length).toBe(1);
    expect(carriedCalls[0][0].payload).not.toHaveProperty('font');
  });

  it('SIGN-35: an app-wide font resolved into `carried` is used, and nothing seeds', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      carriedFont: 'Tinos',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el.fontFamily).toBe('Tinos');
    expect(dispatch.mock.calls.some(([action]) => action.type === 'SET_CARRIED' && 'font' in action.payload)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SNG-15 finding 1 - integration guard: a real gesture on window must still
// finish after a touchend handlePageClick already delegated for (fillTap.ts's
// 'delegate' with a resolved point). Real DOM events and the real gesture
// controller, so this proves stopPropagation's absence end to end rather than
// only that handlePageClick's own event mock was not called.
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures - a live gesture finishes after a delegated touchend', () => {
  it('lets the window\'s own touchend listener (the gesture controller) run after handlePageClick', () => {
    const checkbox = { pageIndex: 0, left: 49, top: 49, width: 2, height: 2 };
    const { handlePageClick } = useWorkspaceGestures({
      selectedTool: null,
      dispatch: vi.fn(),
      activeSignature: null,
      setTempPlacement: vi.fn(),
      setDialogOpen: vi.fn(),
      placeSignatureAt: vi.fn(),
      logAction: vi.fn(),
      setAnnouncement: vi.fn(),
      formRegions: { combs: [], checkboxes: [checkbox] },
    });

    // A drag or resize that began on this element's own touchstart, exactly as
    // DraggableWrapper/useElementResize start one: startGesture listens for
    // touchend on window, in the bubble phase.
    const commit = vi.fn();
    startGesture({
      computePatch: () => ({}),
      writeDOM: () => {},
      commit,
    });

    const el = document.createElement('div');
    document.body.appendChild(el);
    // The overlay's own touchend handler, wired the way PdfWorkspace wires
    // useFillTap's delegate callback to handlePageClick.
    el.addEventListener('touchend', (nativeEvent) => {
      handlePageClick(nativeEvent, 0, { x: 50, y: 50 }, 'symbol');
    });

    el.dispatchEvent(new Event('touchend', { bubbles: true }));

    expect(commit).toHaveBeenCalledTimes(1);
    document.body.removeChild(el);
  });
});

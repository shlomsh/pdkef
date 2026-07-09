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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Synthetic overlay element with a known bounding rect. */
function makeOverlay({ left = 0, top = 0, width = 1000, height = 1000 } = {}) {
  return {
    getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
    closest: () => null,
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

function makeHook(overrides = {}) {
  const dispatch = vi.fn();
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

  it('applies the default font (Arimo) when no initialFont is provided', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontFamily: 'Arimo' });
  });

  it('applies a custom initialFont to new text elements', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialFont: 'Noto Sans Hebrew',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontFamily: 'Noto Sans Hebrew' });
  });

  it('applies the default fontSize (12) when no initialFontSize is provided', () => {
    const { dispatch, handlePageClick } = makeHook({ selectedTool: 'text' });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontSize: 12 });
  });

  it('applies a custom initialFontSize to new text elements', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialFontSize: 24,
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ fontSize: 24 });
  });

  it('does NOT set textDirection when initialDirection is null (auto-detect)', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialDirection: null,
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    const el = firstAddElement(dispatch);
    expect(el).not.toHaveProperty('textDirection');
  });

  it('sets textDirection to "rtl" when the user previously chose RTL', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialDirection: 'rtl',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ textDirection: 'rtl' });
  });

  it('sets textDirection to "ltr" when the user previously chose LTR explicitly', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialDirection: 'ltr',
    });
    handlePageClick(makeClickEvent(500, 500, overlay), 0);
    expect(firstAddElement(dispatch)).toMatchObject({ textDirection: 'ltr' });
  });

  it('applies all remembered text settings together', () => {
    const { dispatch, handlePageClick } = makeHook({
      selectedTool: 'text',
      initialColor: '#123456',
      initialFont: 'David',
      initialFontSize: 18,
      initialDirection: 'rtl',
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
});

// ---------------------------------------------------------------------------
// Drag-drawn shapes — pointer-down placement
// ---------------------------------------------------------------------------

describe('useWorkspaceGestures – drag-drawn shape remembered settings', () => {
  const overlay = makeOverlay();

  beforeEach(() => {
    // handleOverlayPointerDown attaches window listeners — clean up after each test.
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
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
    expect(el.top).toBe(50);
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

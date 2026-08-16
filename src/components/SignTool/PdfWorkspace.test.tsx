// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PdfWorkspace from './PdfWorkspace.tsx';
import workspaceStyles from './Workspace.module.css';
import pageHeaderStyles from '../EditorPageHeader.module.css';
import { SignToolContext } from './SignToolContext.tsx';
import { SignDefaultsContext } from './SignDefaultsContext.tsx';
import { SavedSignaturesContext } from './SavedSignaturesContext.tsx';

function mount(vnode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

// A Provider's `value` replaces the context's own default outright rather than
// merging with it, so these mirror the real default values PdfWorkspace's
// props used to fall back to (see SignDefaultsContext.tsx /
// SavedSignaturesContext.tsx) - a test only needs to override the one or two
// fields it actually asserts on.
function defaultDefaults(overrides = {}) {
  return {
    lastColor: '#000000',
    lastWhiteoutColor: '#ffffff',
    lastFont: 'Arimo',
    lastFontSize: 12,
    lastDirection: null,
    lastThickness: 3,
    lastSymbolWidth: 5,
    rememberColor: vi.fn(),
    rememberWhiteoutColor: vi.fn(),
    rememberFont: vi.fn(),
    rememberFontSize: vi.fn(),
    rememberDirection: vi.fn(),
    rememberThickness: vi.fn(),
    rememberSymbolWidth: vi.fn(),
    ...overrides
  };
}

function defaultSavedSignatures(overrides = {}) {
  return {
    savedSignatures: [],
    activeSignature: null,
    setActiveSignature: vi.fn(),
    onDeleteSavedSignature: vi.fn(),
    ...overrides
  };
}

function defaultProps(overrides = {}) {
  return {
    file: { name: 'sample.pdf' },
    status: 'editing',
    isPseudoFullscreen: false,
    workspaceRef: { current: null },
    numPages: 1,
    pageSizes: [{ width: 600, height: 800 }],
    pdfDocument: null,
    pageWrapperRefs: { current: [] },
    setTempPlacement: vi.fn(),
    setDialogOpen: vi.fn(),
    logAction: vi.fn(),
    handleSavePdf: vi.fn(),
    setAnnouncement: vi.fn(),
    setUndoModalOpen: vi.fn(),
    toggleFullscreen: vi.fn(),
    isFullscreen: false,
    setConfirmResetOpen: vi.fn(),
    placeSignatureAt: vi.fn(),
    ...overrides
  };
}

// Builds (without mounting) the tree PdfWorkspace now needs: SignToolContext
// already existed; SignDefaultsContext and SavedSignaturesContext moved the
// creation-defaults and saved-signature clusters out of props in E8.B3.
// Exposed separately from mountWorkspace() so a test that re-renders with a
// changed prop (see "keeps the same rendered page mounted while signing") can
// build the same tree twice against the same host.
function workspaceTree({ state, dispatch = vi.fn(), props = {}, defaults = {}, savedSignatures = {} }) {
  return (
    <SignToolContext.Provider value={{ state, dispatch }}>
      <SignDefaultsContext.Provider value={defaultDefaults(defaults)}>
        <SavedSignaturesContext.Provider value={defaultSavedSignatures(savedSignatures)}>
          <PdfWorkspace {...defaultProps(props)} />
        </SavedSignaturesContext.Provider>
      </SignDefaultsContext.Provider>
    </SignToolContext.Provider>
  );
}

function mountWorkspace(args) {
  return mount(workspaceTree(args));
}

describe('PdfWorkspace Component', () => {
  let host;

  afterEach(() => {
    if (host) {
      act(() => {
        render(null, host);
      });
      document.body.removeChild(host);
      host = null;
    }
  });

  it('keeps the same rendered page mounted while signing', () => {
    const dispatch = vi.fn();
    const state = { selectedTool: null, elements: [], activeElementId: null, actionHistory: [] };

    host = mountWorkspace({ state, dispatch });
    const pageBefore = host.querySelector(`.${workspaceStyles['page-wrapper']}`);

    act(() => {
      render(workspaceTree({ state, dispatch, props: { status: 'signing' } }), host);
    });

    expect(host.querySelector(`.${workspaceStyles['page-wrapper']}`)).toBe(pageBefore);
    expect(host.querySelector(`.${workspaceStyles.workspace}`).classList.contains(workspaceStyles['is-processing'])).toBe(true);
    expect(host.querySelector(`.${workspaceStyles.workspace}`).getAttribute('aria-busy')).toBe('true');
  });

  it('commits drag-drawn geometry once on release, then ensures its minimum size', () => {
    const dispatch = vi.fn();
    const state = {
      selectedTool: 'rectangle', // select a drag-drawn tool
      elements: [],
      activeElementId: null,
      actionHistory: []
    };

    host = mountWorkspace({ state, dispatch });

    const overlay = host.querySelector(`.${workspaceStyles['page-overlay']}`);
    expect(overlay).not.toBeNull();

    // Mock bounding rectangle so coordinate calculations resolve nicely
    overlay.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      width: 1000,
      height: 1000,
      right: 1100,
      bottom: 1100
    });

    // 1. Simulate mousedown at clientX: 500, clientY: 300
    // Relative to overlay: x = 500 - 100 = 400 (40%), y = 300 - 100 = 200 (20%)
    act(() => {
      overlay.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          clientX: 500,
          clientY: 300
        })
      );
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        type: 'ADD_ELEMENT',
        payload: expect.objectContaining({
          type: 'rectangle',
          left: 40,
          top: 20,
          width: 0,
          height: 0
        })
      })
    );
    expect(dispatch.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        type: 'SET_ACTIVE_ELEMENT_ID'
      })
    );

    // 2. Simulate mousemove to clientX: 600, clientY: 450
    // Delta dx = 100 (10% of 1000), dy = 150 (15% of 1000)
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          clientX: 600,
          clientY: 450
        })
      );
    });

    expect(dispatch).toHaveBeenCalledTimes(2);

    // 3. Simulate mouseup to complete the gesture
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true
        })
      );
    });

    expect(dispatch).toHaveBeenCalledTimes(5);
    expect(dispatch.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        type: 'UPDATE_ELEMENT',
        payload: expect.objectContaining({
          changes: expect.objectContaining({
            left: 40,
            top: 20,
            width: 10,
            height: 15
          })
        })
      })
    );
    expect(dispatch.mock.calls[3][0]).toEqual(
      expect.objectContaining({
        type: 'ENSURE_MINIMUM_SIZE',
        payload: expect.objectContaining({
          tool: 'rectangle',
          rectWidth: 1000,
          rectHeight: 1000,
          startLeftPercent: 40,
          startTopPercent: 20
        })
      })
    );
    // The drawn shape is the tool's one placement, so the tool disarms itself
    // and the next click on empty page area deselects instead of drawing again.
    expect(dispatch.mock.calls[4][0]).toEqual({ type: 'DISARM_TOOL' });
  });

  it('renders a selected symbol with its chosen mark and color in the editor', () => {
    const dispatch = vi.fn();
    const state = {
      selectedTool: null,
      elements: [{
        id: 'symbol-1',
        type: 'symbol',
        pageIndex: 0,
        left: 20,
        top: 20,
        width: 8,
        height: 6,
        mark: 'x',
        color: '#000000'
      }],
      activeElementId: 'symbol-1',
      actionHistory: []
    };

    host = mountWorkspace({ state, dispatch });

    const symbol = host.querySelector('[data-editor-element]');
    const colorHost = symbol.querySelector('div[style*="color"]');
    const path = symbol.querySelector('path[d*="M18 6L6 18"]');

    expect(symbol.hasAttribute('data-editor-active')).toBe(true);
    expect(colorHost.style.color).toBe('rgb(0, 0, 0)');
    expect(path).not.toBeNull();
  });

  it('remembers a resized symbol size for the next placed symbol', () => {
    const dispatch = vi.fn();
    const rememberSymbolWidth = vi.fn();
    const state = {
      selectedTool: null,
      elements: [{
        id: 'symbol-1',
        type: 'symbol',
        pageIndex: 0,
        left: 20,
        top: 20,
        width: 5,
        height: 5,
        mark: 'check',
        color: '#000000'
      }],
      activeElementId: 'symbol-1',
      actionHistory: []
    };

    host = mountWorkspace({ state, dispatch, defaults: { rememberSymbolWidth } });

    const pageWrapper = host.querySelector(`.${workspaceStyles['page-wrapper']}`);
    pageWrapper.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000
    });

    const handle = host.querySelector('[data-editor-resizer="bottom-right"]');
    expect(handle).not.toBeNull();

    // Drag the corner 100px right on a 1000px-wide page: +10% width.
    act(() => {
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 300 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 300 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 400, clientY: 300 }));
    });

    // Bug: a resized symbol must set the size for the next one placed, so
    // repeated check marks don't each need re-sizing by hand.
    expect(rememberSymbolWidth).toHaveBeenCalledWith(15);
  });

  it('remembers edited text size, color, and typed direction for the next text element', () => {
    const dispatch = vi.fn();
    const rememberColor = vi.fn();
    const rememberFontSize = vi.fn();
    const rememberDirection = vi.fn();
    const state = {
      selectedTool: null,
      elements: [{
        id: 'text-1',
        type: 'text',
        pageIndex: 0,
        left: 20,
        top: 20,
        text: 'hey',
        fontSize: 16,
        fontFamily: 'Arimo',
        color: '#000000',
        textDirection: 'ltr'
      }],
      activeElementId: 'text-1',
      actionHistory: []
    };

    host = mountWorkspace({ state, dispatch, defaults: { rememberColor, rememberFontSize, rememberDirection } });

    const increaseFont = host.querySelector('button[title="Increase font size"]');
    expect(increaseFont).not.toBeNull();
    act(() => {
      increaseFont.click();
    });

    expect(rememberFontSize).toHaveBeenCalledWith(17);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ELEMENT',
      payload: { id: 'text-1', changes: { fontSize: 17 } }
    });

    const colorTrigger = host.querySelector('button[title="Text color"]');
    expect(colorTrigger).not.toBeNull();
    act(() => {
      colorTrigger.click();
    });

    const redSwatch = document.body.querySelector('[data-editor-color-swatch][title="#d8342b"]');
    expect(redSwatch).not.toBeNull();
    act(() => {
      redSwatch.click();
    });

    expect(rememberColor).toHaveBeenCalledWith('#d8342b');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ELEMENT',
      payload: { id: 'text-1', changes: { color: '#d8342b' } }
    });

    const textarea = host.querySelector('textarea[data-editor-text-input]');
    expect(textarea).not.toBeNull();
    act(() => {
      textarea.value = 'שלום';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rememberDirection).toHaveBeenCalledWith('rtl');

    act(() => {
      textarea.value = 'hello';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rememberDirection).toHaveBeenCalledWith('ltr');
  });

  it('remembers edited shape thickness for the next placed shape', () => {
    const dispatch = vi.fn();
    const rememberThickness = vi.fn();
    const state = {
      selectedTool: null,
      elements: [{
        id: 'rect-1',
        type: 'rectangle',
        pageIndex: 0,
        left: 20,
        top: 20,
        width: 12,
        height: 6,
        color: '#1463ff',
        strokeWidth: 3
      }],
      activeElementId: 'rect-1',
      actionHistory: []
    };

    host = mountWorkspace({ state, dispatch, defaults: { rememberThickness } });

    const thicknessTrigger = host.querySelector('button[title="Line thickness"]');
    expect(thicknessTrigger).not.toBeNull();
    act(() => {
      thicknessTrigger.click();
    });

    const thickOption = document.body.querySelector('[data-editor-thickness][title="12px thickness"]');
    expect(thickOption).not.toBeNull();
    act(() => {
      thickOption.click();
    });

    // Bug: editing an existing shape's thickness must be remembered for the
    // next shape placement, same as color/font/direction already are.
    expect(rememberThickness).toHaveBeenCalledWith(12);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ELEMENT',
      payload: { id: 'rect-1', changes: { strokeWidth: 12 } }
    });
  });

  it('keeps whiteout color independent from the active text/shape color defaults', () => {
    const dispatch = vi.fn();
    const state = {
      selectedTool: 'whiteout',
      elements: [{
        id: 'text-1',
        type: 'text',
        pageIndex: 0,
        left: 20,
        top: 20,
        text: 'red text',
        fontSize: 16,
        fontFamily: 'Arimo',
        color: '#d8342b',
        textDirection: 'ltr'
      }],
      activeElementId: 'text-1',
      actionHistory: []
    };

    host = mountWorkspace({ state, dispatch, defaults: { lastColor: '#1463ff', lastWhiteoutColor: '#ffffff' } });

    const overlay = host.querySelector(`.${workspaceStyles['page-overlay']}`);
    expect(overlay).not.toBeNull();
    overlay.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 600,
      height: 800,
      right: 600,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    act(() => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 120, clientY: 160 }));
    });

    const added = dispatch.mock.calls.find(([action]) => action.type === 'ADD_ELEMENT')?.[0].payload;
    expect(added).toMatchObject({
      type: 'whiteout',
      color: '#ffffff'
    });
  });

  describe('Clear page', () => {
    it('only renders the button on a page that has elements', () => {
      const dispatch = vi.fn();
      const state = {
        selectedTool: null,
        elements: [{ id: 'el-1', type: 'text', pageIndex: 0 }],
        activeElementId: null,
        actionHistory: []
      };

      host = mountWorkspace({
        state,
        dispatch,
        props: { numPages: 2, pageSizes: [{ width: 600, height: 800 }, { width: 600, height: 800 }] }
      });

      const buttons = host.querySelectorAll(`.${pageHeaderStyles['clear-page']}`);
      expect(buttons).toHaveLength(1);
    });

    it('dispatches CLEAR_PAGE and logs an undoable action for that page only', () => {
      const dispatch = vi.fn();
      const logAction = vi.fn();
      const setAnnouncement = vi.fn();
      const state = {
        selectedTool: null,
        elements: [
          { id: 'el-1', type: 'text', pageIndex: 0 },
          { id: 'el-2', type: 'rectangle', pageIndex: 1 }
        ],
        activeElementId: null,
        actionHistory: []
      };

      host = mountWorkspace({
        state,
        dispatch,
        props: {
          numPages: 2,
          pageSizes: [{ width: 600, height: 800 }, { width: 600, height: 800 }],
          logAction,
          setAnnouncement
        }
      });

      const button = host.querySelector(`.${pageHeaderStyles['clear-page']}`);
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PAGE', payload: 0 });
      expect(logAction).toHaveBeenCalledWith(
        'CLEAR_PAGE',
        null,
        0,
        expect.any(String),
        [state.elements[0]]
      );
      expect(setAnnouncement).toHaveBeenCalledWith('Cleared page 1.');
    });
  });
});

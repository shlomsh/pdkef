import { render } from 'preact';
import type { ComponentChildren, ComponentProps } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PdfWorkspace from './PdfWorkspace.tsx';
import workspaceStyles from './Workspace.module.css';
import pageHeaderStyles from '../EditorPageHeader.module.css';
import { createPageGeometry } from '../../editor/geometry/coords.js';
import type { RectangleElement, SymbolElement, TextElement } from '../../editor/model/editorModel.ts';
import { SignToolContext, type SignToolAction, type SignToolState } from './SignToolContext.tsx';
import { SignDefaultsContext, type SignDefaultsContextValue } from './SignDefaultsContext.tsx';
import { SavedSignaturesContext, type SavedSignaturesContextValue } from './SavedSignaturesContext.tsx';

const pageSize = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });

function required<T extends Element>(element: T | null, description: string): T {
  if (!element) throw new Error(`Expected ${description} to exist`);
  return element;
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function textElement(id: string, overrides: Partial<TextElement> = {}): TextElement {
  return { id, type: 'text', pageIndex: 0, left: 0, top: 0, text: '', ...overrides };
}

function symbolElement(id: string, overrides: Partial<SymbolElement> = {}): SymbolElement {
  return { id, type: 'symbol', pageIndex: 0, left: 0, top: 0, width: 5, height: 5, ...overrides };
}

function rectangleElement(id: string, overrides: Partial<RectangleElement> = {}): RectangleElement {
  return { id, type: 'rectangle', pageIndex: 0, left: 0, top: 0, width: 0, height: 0, ...overrides };
}

function testState(overrides: Partial<SignToolState> = {}): SignToolState {
  return {
    selectedTool: null,
    toolLocked: false,
    elements: [],
    activeElementId: null,
    editingElementId: null,
    actionHistory: [],
    documentRevision: 0,
    ...overrides,
  };
}

function mount(vnode: ComponentChildren): HTMLDivElement {
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
function defaultDefaults(overrides: Partial<SignDefaultsContextValue> = {}): SignDefaultsContextValue {
  return {
    lastColor: '#000000',
    lastWhiteoutColor: '#ffffff',
    lastFont: 'Arimo',
    lastFontSize: 12,
    lastDirection: null,
    lastThickness: 3,
    lastSymbolWidth: 5,
    lastSymbolMark: 'check',
    lastSignatureWidth: 20,
    rememberColor: vi.fn(),
    rememberWhiteoutColor: vi.fn(),
    rememberFont: vi.fn(),
    rememberFontSize: vi.fn(),
    rememberDirection: vi.fn(),
    rememberThickness: vi.fn(),
    rememberSymbolWidth: vi.fn(),
    rememberSymbolMark: vi.fn(),
    rememberSignatureWidth: vi.fn(),
    ...overrides
  };
}

function defaultSavedSignatures(overrides: Partial<SavedSignaturesContextValue> = {}): SavedSignaturesContextValue {
  return {
    savedSignatures: [],
    activeSignature: null,
    setActiveSignature: vi.fn(),
    onDeleteSavedSignature: vi.fn(),
    ...overrides
  };
}

function defaultProps(overrides: Partial<ComponentProps<typeof PdfWorkspace>> = {}): ComponentProps<typeof PdfWorkspace> {
  return {
    status: 'editing',
    isPseudoFullscreen: false,
    workspaceRef: { current: null },
    numPages: 1,
    pageSizes: [pageSize],
    pdfDocument: null,
    pageWrapperRefs: { current: [] },
    setTempPlacement: vi.fn(),
    setDialogOpen: vi.fn(),
    logAction: vi.fn(),
    handleSavePdf: vi.fn(),
    handleDownloadPdf: vi.fn(),
    handleSharePdf: vi.fn(),
    setAnnouncement: vi.fn(),
    setUndoModalOpen: vi.fn(),
    toggleFullscreen: vi.fn(),
    isFullscreen: false,
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
interface WorkspaceTreeOptions {
  state: SignToolState;
  dispatch?: (action: SignToolAction) => void;
  props?: Partial<ComponentProps<typeof PdfWorkspace>>;
  defaults?: Partial<SignDefaultsContextValue>;
  savedSignatures?: Partial<SavedSignaturesContextValue>;
}

function workspaceTree({ state, dispatch = vi.fn<(action: SignToolAction) => void>(), props = {}, defaults = {}, savedSignatures = {} }: WorkspaceTreeOptions) {
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

function mountWorkspace(args: WorkspaceTreeOptions): HTMLDivElement {
  return mount(workspaceTree(args));
}

describe('PdfWorkspace Component', () => {
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (host) {
      act(() => {
        render(null, host!);
      });
      document.body.removeChild(host);
      host = null;
    }
  });

  it('keeps the same rendered page mounted while signing', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const state = testState();

    host = mountWorkspace({ state, dispatch });
    const pageBefore = host.querySelector(`.${workspaceStyles['page-wrapper']}`);

    act(() => {
      render(workspaceTree({ state, dispatch, props: { status: 'signing' } }), host!);
    });

    expect(host.querySelector(`.${workspaceStyles['page-wrapper']}`)).toBe(pageBefore);
    const workspace = required(host.querySelector(`.${workspaceStyles.workspace}`), 'workspace');
    expect(workspace.classList.contains(workspaceStyles['is-processing'])).toBe(true);
    expect(workspace.getAttribute('aria-busy')).toBe('true');
  });

  it('commits drag-drawn geometry once on release, then ensures its minimum size', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const state = testState({
      selectedTool: 'rectangle', // select a drag-drawn tool
    });

    host = mountWorkspace({ state, dispatch });

    const overlay = required(host.querySelector<HTMLDivElement>(`.${workspaceStyles['page-overlay']}`), 'page overlay');

    // Mock bounding rectangle so coordinate calculations resolve nicely
    overlay.getBoundingClientRect = () => rect(100, 100, 1000, 1000);

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
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const state = testState({
      elements: [symbolElement('symbol-1', { left: 20, top: 20, width: 8, height: 6, mark: 'x', color: '#000000' })],
      activeElementId: 'symbol-1',
    });

    host = mountWorkspace({ state, dispatch });

    const symbol = required(host.querySelector('[data-editor-element]'), 'symbol element');
    const colorHost = required(symbol.querySelector<HTMLElement>('div[style*="color"]'), 'symbol color host');
    // The cross's editor path now matches the exporter's (symbolMarks.ts).
    const path = symbol.querySelector('path[d*="M4 4L20 20"]');

    expect(symbol.hasAttribute('data-editor-active')).toBe(true);
    expect(colorHost.style.color).toBe('rgb(0, 0, 0)');
    expect(path).not.toBeNull();
  });

  it('remembers a resized symbol size for the next placed symbol', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const rememberSymbolWidth = vi.fn();
    const state = testState({
      elements: [symbolElement('symbol-1', { left: 20, top: 20, mark: 'check', color: '#000000' })],
      activeElementId: 'symbol-1',
    });

    host = mountWorkspace({ state, dispatch, defaults: { rememberSymbolWidth } });

    const pageWrapper = required(host.querySelector<HTMLDivElement>(`.${workspaceStyles['page-wrapper']}`), 'page wrapper');
    pageWrapper.getBoundingClientRect = () => rect(0, 0, 1000, 1000);

    const handle = required(host.querySelector('[data-editor-resizer="bottom-right"]'), 'bottom-right resizer');

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

  it('remembers a switched symbol mark for the next placed symbol', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const rememberSymbolMark = vi.fn();
    const state = testState({ elements: [symbolElement('symbol-1', { left: 20, top: 20, mark: 'check', color: '#000000' })], activeElementId: 'symbol-1' });

    host = mountWorkspace({ state, dispatch, defaults: { rememberSymbolMark } });

    const xButton = required(host.querySelector<HTMLButtonElement>('button[title="X mark"]'), 'X mark button');

    act(() => {
      xButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Bug: switching a placed symbol from check to X must set the mark for the
    // next one placed, so it doesn't silently reset to check.
    expect(rememberSymbolMark).toHaveBeenCalledWith('x');
  });

  it('places a new symbol with the last remembered mark, not always a check mark', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const state = testState({ selectedTool: 'symbol' });

    host = mountWorkspace({ state, dispatch, defaults: { lastSymbolMark: 'x' } });

    const overlay = required(host.querySelector<HTMLDivElement>(`.${workspaceStyles['page-overlay']}`), 'page overlay');
    overlay.getBoundingClientRect = () => rect(0, 0, 1000, 1000);

    act(() => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
    });

    const addedCall = dispatch.mock.calls.find(
      (call): call is [Extract<SignToolAction, { type: 'ADD_ELEMENT' }>] => call[0].type === 'ADD_ELEMENT',
    );
    const added = addedCall?.[0].payload;
    expect(added?.type).toBe('symbol');
    if (added?.type !== 'symbol') throw new Error('Expected a symbol element');
    expect(added?.mark).toBe('x');
  });

  it('remembers edited text size, color, and typed direction for the next text element', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const rememberColor = vi.fn();
    const rememberFontSize = vi.fn();
    const rememberDirection = vi.fn();
    const state = testState({ elements: [textElement('text-1', { left: 20, top: 20, text: 'hey', fontSize: 16, fontFamily: 'Arimo', color: '#000000', textDirection: 'ltr' })], activeElementId: 'text-1' });

    host = mountWorkspace({ state, dispatch, defaults: { rememberColor, rememberFontSize, rememberDirection } });

    const increaseFont = required(host.querySelector<HTMLButtonElement>('button[title="Increase font size"]'), 'increase font button');
    act(() => {
      increaseFont.click();
    });

    expect(rememberFontSize).toHaveBeenCalledWith(17);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ELEMENT',
      payload: { id: 'text-1', changes: { fontSize: 17 } }
    });

    const colorTrigger = required(host.querySelector<HTMLButtonElement>('button[title="Text color"]'), 'text color button');
    act(() => {
      colorTrigger.click();
    });

    const redSwatch = required(document.body.querySelector<HTMLButtonElement>('[data-editor-color-swatch][title="#d8342b"]'), 'red color swatch');
    act(() => {
      redSwatch.click();
    });

    expect(rememberColor).toHaveBeenCalledWith('#d8342b');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ELEMENT',
      payload: { id: 'text-1', changes: { color: '#d8342b' } }
    });

    const textarea = required(host.querySelector<HTMLTextAreaElement>('textarea[data-editor-text-input]'), 'text editor');
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

  it('creates a new text field LTR after an RTL field instead of inheriting its direction', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const state = testState({ selectedTool: 'text', elements: [textElement('rtl-text', { left: 70, top: 20, text: 'שלום', fontSize: 12, fontFamily: 'Arimo', textDirection: 'rtl' })], activeElementId: 'rtl-text' });

    host = mountWorkspace({ state, dispatch, defaults: { lastDirection: 'rtl' } });
    const overlay = required(host.querySelector<HTMLDivElement>(`.${workspaceStyles['page-overlay']}`), 'page overlay');
    overlay.getBoundingClientRect = () => rect(0, 0, 1000, 1000);

    act(() => {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
    });

    const addedCall = dispatch.mock.calls.find(
      (call): call is [Extract<SignToolAction, { type: 'ADD_ELEMENT' }>] => call[0].type === 'ADD_ELEMENT',
    );
    const added = addedCall?.[0].payload;
    expect(added).toMatchObject({ type: 'text', text: '', textDirection: 'ltr' });
  });

  it('coordinates both export locations from one blocking-field preflight and reviews the first field', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const setAnnouncement = vi.fn();
    const state = testState({
      elements: [
        textElement('needs-font', { left: 20, top: 20, text: '😀', fontFamily: 'Arimo', fontSize: 12 }),
        textElement('safe', { left: 40, top: 40, text: 'Name', fontFamily: 'Arimo', fontSize: 12 }),
      ],
    });

    host = mountWorkspace({ state, dispatch, props: { canSharePdf: true, setAnnouncement } });

    const notice = host.querySelector('[data-sign-export-readiness]');
    expect(notice?.textContent).toContain('1 text field needs attention');
    expect(notice?.textContent).not.toContain('😀');

    const topExportButtons = host.querySelectorAll('button[aria-describedby="sign-export-readiness"]');
    expect(topExportButtons).toHaveLength(4);
    Array.from(topExportButtons).forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true));

    const reviewButton = Array.from(notice!.querySelectorAll('button')).find((button) => button.textContent === 'Review fields');
    act(() => {
      reviewButton!.click();
    });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_ACTIVE_ELEMENT_ID', payload: 'needs-font' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EDITING_ELEMENT_ID', payload: 'needs-font' });
    expect(setAnnouncement).toHaveBeenCalledWith('Showing the first text field that needs attention.');
  });

  it('remembers edited shape thickness for the next placed shape', () => {
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const rememberThickness = vi.fn();
    const state = testState({ elements: [rectangleElement('rect-1', { left: 20, top: 20, width: 12, height: 6, color: '#1463ff', strokeWidth: 3 })], activeElementId: 'rect-1' });

    host = mountWorkspace({ state, dispatch, defaults: { rememberThickness } });

    const thicknessTrigger = required(host.querySelector<HTMLButtonElement>('button[title="Line thickness"]'), 'line thickness button');
    act(() => {
      thicknessTrigger.click();
    });

    const thickOption = required(document.body.querySelector<HTMLButtonElement>('[data-editor-thickness][title="12px thickness"]'), '12px thickness option');
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
    const dispatch = vi.fn<(action: SignToolAction) => void>();
    const state = testState({ selectedTool: 'whiteout', elements: [textElement('text-1', { left: 20, top: 20, text: 'red text', fontSize: 16, fontFamily: 'Arimo', color: '#d8342b', textDirection: 'ltr' })], activeElementId: 'text-1' });

    host = mountWorkspace({ state, dispatch, defaults: { lastColor: '#1463ff', lastWhiteoutColor: '#ffffff' } });

    const overlay = required(host.querySelector<HTMLDivElement>(`.${workspaceStyles['page-overlay']}`), 'page overlay');
    overlay.getBoundingClientRect = () => rect(0, 0, 600, 800);

    act(() => {
      overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 120, clientY: 160 }));
    });

    const addedCall = dispatch.mock.calls.find(
      (call): call is [Extract<SignToolAction, { type: 'ADD_ELEMENT' }>] => call[0].type === 'ADD_ELEMENT',
    );
    const added = addedCall?.[0].payload;
    expect(added).toMatchObject({
      type: 'whiteout',
      color: '#ffffff'
    });
  });

  describe('Clear page', () => {
    it('only renders the button on a page that has elements', () => {
      const dispatch = vi.fn<(action: SignToolAction) => void>();
      const state = testState({ elements: [textElement('el-1')] });

      host = mountWorkspace({
        state,
        dispatch,
        props: { numPages: 2, pageSizes: [pageSize, pageSize] }
      });

      const buttons = host.querySelectorAll(`.${pageHeaderStyles['clear-page']}`);
      expect(buttons).toHaveLength(1);
    });

    it('dispatches CLEAR_PAGE and logs an undoable action for that page only', () => {
      const dispatch = vi.fn<(action: SignToolAction) => void>();
      const logAction = vi.fn();
      const setAnnouncement = vi.fn();
      const state = testState({
        elements: [textElement('el-1'), rectangleElement('el-2', { pageIndex: 1 })],
      });

      host = mountWorkspace({
        state,
        dispatch,
        props: {
          numPages: 2,
          pageSizes: [pageSize, pageSize],
          logAction,
          setAnnouncement
        }
      });

      const button = required(host.querySelector<HTMLButtonElement>(`.${pageHeaderStyles['clear-page']}`), 'clear page button');
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PAGE', payload: 0 });
      expect(logAction).toHaveBeenCalledWith(
        'delete',
        'CLEAR_PAGE',
        0,
        expect.any(String),
        [{ element: state.elements[0], index: 0 }]
      );
      expect(setAnnouncement).toHaveBeenCalledWith('Cleared page 1.');
    });
  });
});

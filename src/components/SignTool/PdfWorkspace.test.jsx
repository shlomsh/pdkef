import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PdfWorkspace from './PdfWorkspace.jsx';
import workspaceStyles from './Workspace.module.css';
import { SignToolContext } from './SignToolContext.jsx';

function mount(vnode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
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
      activeSignature: null,
      setTempPlacement: vi.fn(),
      setDialogOpen: vi.fn(),
      rememberColor: vi.fn(),
      rememberWhiteoutColor: vi.fn(),
      rememberFont: vi.fn(),
      rememberFontSize: vi.fn(),
      rememberDirection: vi.fn(),
      rememberThickness: vi.fn(),
      logAction: vi.fn(),
      handleSavePdf: vi.fn(),
      setAnnouncement: vi.fn(),
      savedSignatures: [],
      setActiveSignature: vi.fn(),
      onDeleteSavedSignature: vi.fn(),
      setUndoModalOpen: vi.fn(),
      toggleFullscreen: vi.fn(),
      isFullscreen: false,
      setConfirmResetOpen: vi.fn(),
      placeSignatureAt: vi.fn(),
      ...overrides
    };
  }

  it('keeps the same rendered page mounted while signing', () => {
    const dispatch = vi.fn();
    const state = { selectedTool: null, elements: [], activeElementId: null, actionHistory: [] };
    const props = defaultProps();

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace {...props} />
      </SignToolContext.Provider>
    );
    const pageBefore = host.querySelector(`.${workspaceStyles['page-wrapper']}`);

    act(() => {
      render(
        <SignToolContext.Provider value={{ state, dispatch }}>
          <PdfWorkspace {...props} status="signing" />
        </SignToolContext.Provider>,
        host
      );
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

    const mockProps = defaultProps();

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace {...mockProps} />
      </SignToolContext.Provider>
    );

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

    expect(dispatch).toHaveBeenCalledTimes(4);
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

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace {...defaultProps()} />
      </SignToolContext.Provider>
    );

    const symbol = host.querySelector('.sign-element');
    const colorHost = symbol.querySelector('div[style*="color"]');
    const path = symbol.querySelector('path[d*="M18 6L6 18"]');

    expect(symbol.classList.contains('active')).toBe(true);
    expect(colorHost.style.color).toBe('rgb(0, 0, 0)');
    expect(path).not.toBeNull();
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

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace
          {...defaultProps({ rememberColor, rememberFontSize, rememberDirection })}
        />
      </SignToolContext.Provider>
    );

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

    const redSwatch = document.body.querySelector('.sign-color-swatch[title="#d8342b"]');
    expect(redSwatch).not.toBeNull();
    act(() => {
      redSwatch.click();
    });

    expect(rememberColor).toHaveBeenCalledWith('#d8342b');
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_ELEMENT',
      payload: { id: 'text-1', changes: { color: '#d8342b' } }
    });

    const textarea = host.querySelector('textarea.sign-text-input');
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

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace {...defaultProps({ rememberThickness })} />
      </SignToolContext.Provider>
    );

    const thicknessTrigger = host.querySelector('button[title="Line thickness"]');
    expect(thicknessTrigger).not.toBeNull();
    act(() => {
      thicknessTrigger.click();
    });

    const thickOption = document.body.querySelector('.sign-thickness-item[title="12px thickness"]');
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

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace {...defaultProps({ lastColor: '#1463ff', lastWhiteoutColor: '#ffffff' })} />
      </SignToolContext.Provider>
    );

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
});

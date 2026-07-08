import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PdfWorkspace from './PdfWorkspace.jsx';
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
      document.body.removeChild(host);
      host = null;
    }
  });

  it('correctly dispatches ADD_ELEMENT, UPDATE_ELEMENT, and ENSURE_MINIMUM_SIZE on drag-drawing', () => {
    const dispatch = vi.fn();
    const state = {
      selectedTool: 'rectangle', // select a drag-drawn tool
      elements: [],
      activeElementId: null,
      actionHistory: []
    };

    const mockProps = {
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
      rememberFont: vi.fn(),
      rememberFontSize: vi.fn(),
      rememberDirection: vi.fn(),
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
      placeSignatureAt: vi.fn()
    };

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace {...mockProps} />
      </SignToolContext.Provider>
    );

    const overlay = host.querySelector('.sign-page-overlay');
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

    expect(dispatch).toHaveBeenCalledTimes(3);
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

    // 3. Simulate mouseup to complete the gesture
    act(() => {
      window.dispatchEvent(
        new MouseEvent('mouseup', {
          bubbles: true
        })
      );
    });

    expect(dispatch).toHaveBeenCalledTimes(4);
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

  it('computes correct layout styles for workspace containers (CSS validation)', () => {
    const dispatch = vi.fn();
    const state = {
      selectedTool: null,
      elements: [],
      activeElementId: null,
      actionHistory: []
    };

    const mockProps = {
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
      rememberFont: vi.fn(),
      rememberFontSize: vi.fn(),
      rememberDirection: vi.fn(),
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
      placeSignatureAt: vi.fn()
    };

    host = mount(
      <SignToolContext.Provider value={{ state, dispatch }}>
        <PdfWorkspace {...mockProps} />
      </SignToolContext.Provider>
    );

    const workspace = host.querySelector('.sign-workspace');
    expect(workspace).not.toBeNull();
    const computed = window.getComputedStyle(workspace);
    expect(computed.display).toBe('flex');
    expect(computed.flexDirection).toBe('column');
    expect(computed.alignItems).toBe('center');
  });
});


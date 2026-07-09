import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import PdfRedactTool from './PdfRedactTool.jsx';
import { pxToPercent, pxDeltaToPercent } from '../lib/coords.js';

function makePdfFile(name) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

// Mock getDocument because we don't want to load actual pdf.js workers in jsdom environment
vi.mock('pdfjs-dist', () => {
  return {
    GlobalWorkerOptions: {
      workerSrc: ''
    },
    getDocument: vi.fn(() => ({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn(() => Promise.resolve({
          getViewport: () => ({ width: 612, height: 792 }),
          render: () => ({ promise: Promise.resolve() })
        }))
      })
    }))
  };
});

describe('PdfRedactTool UI flow', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
  });

  it('renders the initial file dropper zone', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container);
    });

    const dropzone = container.querySelector('.dropzone');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain('Select or drop a PDF to redact');
  });

  it('transitions to editing state when a file is selected', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_secret.pdf');

    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Wait for async file loading
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Verify hint message appears indicating editing mode
    const header = container.querySelector('.sign-help-tip');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('hide sensitive text');
    
    // Verify toolbar modes exist
    const toolbar = container.querySelector('.sign-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar.textContent).toContain('Blackout');
    expect(toolbar.textContent).toContain('Blur');
  });

  async function loadFileAndGetDrawArea() {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<PdfRedactTool />, container);
    });

    const input = container.querySelector('input[type="file"]');
    const file = makePdfFile('test_secret.pdf');
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const drawArea = container.querySelector('.redact-draw-area');
    drawArea.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => {}
    });
    return drawArea;
  }

  // Each dispatch is its own act() so the state update it triggers (e.g. setDrawingState
  // in handlePointerDown) flushes and re-renders before the next event is handled —
  // batching them in one act() left drawingState still null when handlePointerMove ran.
  async function drawBox(drawArea, downX, downY, moveX, moveY) {
    await act(async () => {
      drawArea.dispatchEvent(new MouseEvent('mousedown', { clientX: downX, clientY: downY, bubbles: true }));
    });
    await act(async () => {
      drawArea.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
  }

  it('draws a box whose left/top/width/height are pxToPercent of the draw area, not raw px/rect.width math', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    await drawBox(drawArea, 50, 200, 200, 500);

    const box = container.querySelector('.redact-box');
    expect(box).not.toBeNull();

    const startLeft = pxToPercent(50, 500);
    const startTop = pxToPercent(200, 1000);
    const endLeft = pxToPercent(200, 500);
    const endTop = pxToPercent(500, 1000);

    expect(parseFloat(box.style.left)).toBeCloseTo(Math.min(startLeft, endLeft));
    expect(parseFloat(box.style.top)).toBeCloseTo(Math.min(startTop, endTop));
    expect(parseFloat(box.style.width)).toBeCloseTo(Math.abs(endLeft - startLeft));
    expect(parseFloat(box.style.height)).toBeCloseTo(Math.abs(endTop - startTop));
  });

  it('drags an existing box by a percent delta computed via pxDeltaToPercent against the wrapper', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    // Draw a box first so there's something to drag.
    await drawBox(drawArea, 50, 200, 200, 500);

    const box = container.querySelector('.redact-box');
    const startLeftPercent = parseFloat(box.style.left);
    const startTopPercent = parseFloat(box.style.top);

    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 300 })); // dx=50 dy=200
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const expectedLeft = startLeftPercent + pxDeltaToPercent(50, 500);
    const expectedTop = startTopPercent + pxDeltaToPercent(200, 1000);

    expect(parseFloat(box.style.left)).toBeCloseTo(expectedLeft);
    expect(parseFloat(box.style.top)).toBeCloseTo(expectedTop);
  });

  it('resizes an existing box by a percent delta computed via pxDeltaToPercent against the wrapper', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    await drawBox(drawArea, 50, 200, 200, 500);

    const box = container.querySelector('.redact-box');
    const startWidthPercent = parseFloat(box.style.width);
    const startHeightPercent = parseFloat(box.style.height);

    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const resizer = box.querySelector('.sign-element-resizer.corner.bottom-right');
    expect(resizer).not.toBeNull();

    await act(async () => {
      resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 180 })); // dx=30 dy=80
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const expectedWidth = startWidthPercent + pxDeltaToPercent(30, 500);
    const expectedHeight = startHeightPercent + pxDeltaToPercent(80, 1000);

    expect(parseFloat(box.style.width)).toBeCloseTo(expectedWidth);
    expect(parseFloat(box.style.height)).toBeCloseTo(expectedHeight);
  });

  // --- Regression: whiteout box resize flying off-page (handleBoxResizeStart) ---
  //
  // Root cause: handleBoxResizeStart's left/top/top-left/bottom-left/top-right
  // branches derived newLeft/newTop as `start.left - (newWidth - start.width)`
  // where newWidth/newHeight were only clamped against MIN/MAX_SHAPE_SIZE_PCT,
  // never against the box's own anchored (opposite) edge. A large outward drag
  // on e.g. the left handle drives newWidth up to MAX_SHAPE_SIZE_PCT (90) with
  // no regard for how much room is actually left between the anchored right
  // edge and the page edge, so newLeft goes negative and the box renders off
  // the left/top of the page (effectively "disappears").
  //
  // These tests use the SAME realistic, non-degenerate mocked wrapper rect
  // (500x1000, via loadFileAndGetDrawArea's drawArea.getBoundingClientRect
  // override — that draw area IS the resize handler's `wrapper`, since both
  // `sign-page-wrapper` and `redact-draw-area` are classes on one DOM node) as
  // the existing tests above, per ARCHITECTURE.md §5's "vacuous 0x0-rect
  // geometry tests" hazard: an unmocked jsdom rect is 0x0, which turns every
  // pixel delta into +/-Infinity and saturates the MIN/MAX clamp either way,
  // masking exactly this class of bug. With a real 500x1000 rect, the drag
  // distances below map to finite, checkable percentages and genuinely
  // exercise the anchor math.
  describe('whiteout box resize stays on-page (regression)', () => {
    async function setupSelectedWhiteoutBox() {
      const drawArea = await loadFileAndGetDrawArea();

      // Switch to whiteout mode — all redaction box styles now get the
      // 8-direction ElementResizers handles.
      const whiteoutBtn = Array.from(container.querySelectorAll('.sign-toolbar .sign-tool-btn'))
        .find((btn) => btn.textContent.includes('Whiteout'));
      await act(async () => {
        whiteoutBtn.click();
      });

      // Draw a box at left=20%, top=30%, width=30%, height=20% on the 500x1000
      // wrapper (100,300) -> (250,500) in px. Mirrors the diagnosed repro
      // (left:20, width:30).
      await drawBox(drawArea, 100, 300, 250, 500);
      const box = container.querySelector('.redact-box');
      expect(parseFloat(box.style.left)).toBeCloseTo(20);
      expect(parseFloat(box.style.top)).toBeCloseTo(30);
      expect(parseFloat(box.style.width)).toBeCloseTo(30);
      expect(parseFloat(box.style.height)).toBeCloseTo(20);

      // Select it (mousedown + immediate mouseup, zero delta) so ElementResizers
      // renders its handles — they're gated on isSelected/isActive.
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      return box;
    }

    async function dragHandle(box, handleClass, downX, downY, moveX, moveY) {
      const handle = box.querySelector(`.sign-element-resizer.${handleClass}`);
      expect(handle).not.toBeNull();
      await act(async () => {
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: downX, clientY: downY, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
    }

    it('left-handle resize with a large outward drag keeps left >= 0 and preserves the anchored right edge', async () => {
      const box = await setupSelectedWhiteoutBox();

      // dx = -500px on a 500px-wide wrapper = -100% — a huge outward drag on
      // the left handle. Anchored right edge is at left+width = 20+30 = 50%.
      await dragHandle(box, 'left', 300, 0, -200, 0);

      const committedLeft = parseFloat(box.style.left);
      const committedWidth = parseFloat(box.style.width);

      expect(committedLeft).toBeGreaterThanOrEqual(0);
      expect(committedLeft + committedWidth).toBeCloseTo(50, 5);
    });

    it('top-handle resize with a large outward drag keeps top >= 0 and preserves the anchored bottom edge', async () => {
      const box = await setupSelectedWhiteoutBox();

      // dy = -900px on a 1000px-tall wrapper = -90% — a huge outward drag on
      // the top handle. Anchored bottom edge is at top+height = 30+20 = 50%.
      await dragHandle(box, 'top', 0, 300, 0, -600);

      const committedTop = parseFloat(box.style.top);
      const committedHeight = parseFloat(box.style.height);

      expect(committedTop).toBeGreaterThanOrEqual(0);
      expect(committedTop + committedHeight).toBeCloseTo(50, 5);
    });

    it('top-left corner resize with a large outward drag keeps both left >= 0 and top >= 0 (box stays on page)', async () => {
      const box = await setupSelectedWhiteoutBox();

      await dragHandle(box, 'top-left', 300, 300, -200, -600);

      const committedLeft = parseFloat(box.style.left);
      const committedTop = parseFloat(box.style.top);

      expect(committedLeft).toBeGreaterThanOrEqual(0);
      expect(committedTop).toBeGreaterThanOrEqual(0);
    });

    it('sanity: right-handle resize still grows the box normally and never moves left/top', async () => {
      const box = await setupSelectedWhiteoutBox();

      // Modest +50px (10%) growth, well within bounds — no clamp should
      // engage at all, on either the old or fixed code path.
      await dragHandle(box, 'right', 0, 0, 50, 0);

      expect(parseFloat(box.style.left)).toBeCloseTo(20);
      expect(parseFloat(box.style.top)).toBeCloseTo(30);
      expect(parseFloat(box.style.width)).toBeCloseTo(40);
      expect(parseFloat(box.style.height)).toBeCloseTo(20);
    });

    it('whiteout uses the floating toolbar delete control instead of the overlapping red corner delete button', async () => {
      const box = await setupSelectedWhiteoutBox();

      expect(box.classList.contains('sign-element--shape')).toBe(true);
      expect(box.querySelector('.redact-element-btn')).toBeNull();
      expect(box.querySelector('.sign-element-resizer.corner.top-right')).not.toBeNull();

      const toolbarDelete = box.querySelector('.sign-element-actions button[title="Delete element"]');
      expect(toolbarDelete).not.toBeNull();
    });

    it('blackout boxes render the 8 resize handles and keep the remove button reachable inside the box', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      await drawBox(drawArea, 50, 200, 200, 500);

      const box = container.querySelector('.redact-box');
      expect(box).not.toBeNull();

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(box.classList.contains('sign-element--shape')).toBe(true);
      expect(box.querySelector('.redact-element-btn')).not.toBeNull();
      expect(box.querySelector('.redact-box-resizer')).toBeNull();
      expect(box.querySelectorAll('.sign-element-resizer').length).toBe(8);
      expect(box.querySelector('.redact-element-btn').style.top).toBe('8px');
      expect(box.querySelector('.redact-element-btn').style.right).toBe('8px');
    });

    it('blur boxes also render the 8 resize handles and keep the remove button reachable inside the box', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      const blurBtn = Array.from(container.querySelectorAll('.sign-toolbar .sign-tool-btn'))
        .find((btn) => btn.textContent.includes('Blur'));
      await act(async () => {
        blurBtn.click();
      });

      await drawBox(drawArea, 50, 200, 200, 500);

      const box = container.querySelector('.redact-box');
      expect(box).not.toBeNull();
      expect(box.querySelector('.redact-element-btn')).not.toBeNull();
      expect(box.querySelector('.redact-box-resizer')).toBeNull();

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(box.classList.contains('sign-element--shape')).toBe(true);
      expect(box.querySelectorAll('.sign-element-resizer').length).toBe(8);
      expect(box.querySelector('.redact-element-btn').style.top).toBe('8px');
      expect(box.querySelector('.redact-element-btn').style.right).toBe('8px');
    });

    // --- E1.5: generalize the whiteout-resize post-mortem's three gesture
    // invariants (scrum.md) to this second, independent implementation of the
    // same math (handleBoxResizeStart/handleBoxDragStart in PdfRedactTool.jsx
    // — see its own comment there noting it mirrors DraggableWrapper.jsx's
    // handleResizeMove; ARCHITECTURE.md's E4.3 backlog item is to converge
    // these two copies, which is exactly why this file needs its own
    // coverage rather than relying on the Sign tool's tests). Move already
    // has basic coverage above ("drags an existing box..."); these add the
    // move width/height-untouched invariant plus the zero-delta no-op. ---
    it('move: dragging the box body by a delta leaves width/height untouched (E1.5 move invariant)', async () => {
      const box = await setupSelectedWhiteoutBox();
      const startWidth = parseFloat(box.style.width);
      const startHeight = parseFloat(box.style.height);

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 100, bubbles: true })); // +10% / +10%
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(parseFloat(box.style.left)).toBeCloseTo(30); // 20 + 10
      expect(parseFloat(box.style.top)).toBeCloseTo(40); // 30 + 10
      expect(parseFloat(box.style.width)).toBeCloseTo(startWidth);
      expect(parseFloat(box.style.height)).toBeCloseTo(startHeight);
    });

    it('a zero-delta resize commits exactly the start geometry, with no drift (E1.5 zero-delta invariant)', async () => {
      const box = await setupSelectedWhiteoutBox();
      const startLeft = parseFloat(box.style.left);
      const startTop = parseFloat(box.style.top);
      const startWidth = parseFloat(box.style.width);
      const startHeight = parseFloat(box.style.height);

      await dragHandle(box, 'bottom-right', 200, 200, 200, 200);

      expect(parseFloat(box.style.left)).toBeCloseTo(startLeft);
      expect(parseFloat(box.style.top)).toBeCloseTo(startTop);
      expect(parseFloat(box.style.width)).toBeCloseTo(startWidth);
      expect(parseFloat(box.style.height)).toBeCloseTo(startHeight);
    });
  });

  // E1.5: blackout and blur became resizable in commit 274b293 — previously a
  // single corner dot, now the full 8-handle ElementResizers on the same
  // handleBoxResizeStart path as whiteout. The regression block above exercises
  // that math through whiteout, but E1.5 mandates the three gesture invariants
  // for EVERY resizable type. handleBoxResizeStart does not branch on el.style,
  // so a failure here would mean the render layer forked the resize path per
  // style. Same realistic 500x1000 mocked wrapper (via loadFileAndGetDrawArea).
  describe('blackout/blur resize invariants (E1.5)', () => {
    async function setupSelectedBox(styleLabel) {
      const drawArea = await loadFileAndGetDrawArea();
      if (styleLabel) {
        const btn = Array.from(container.querySelectorAll('.sign-toolbar .sign-tool-btn'))
          .find((b) => b.textContent.includes(styleLabel));
        await act(async () => {
          btn.click();
        });
      }
      // left=20%, top=30%, width=30%, height=20% on the 500x1000 wrapper.
      await drawBox(drawArea, 100, 300, 250, 500);
      const box = container.querySelector('.redact-box');
      expect(box).not.toBeNull();
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
      return box;
    }

    async function dragHandle(box, handleClass, downX, downY, moveX, moveY) {
      const handle = box.querySelector(`.sign-element-resizer.${handleClass}`);
      expect(handle).not.toBeNull();
      await act(async () => {
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: downX, clientY: downY, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
    }

    // blackout is the default mode (no button click); blur is selected via its toolbar button.
    for (const { label, styleLabel } of [
      { label: 'blackout', styleLabel: null },
      { label: 'blur', styleLabel: 'Blur' },
    ]) {
      describe(label, () => {
        it('anchor: left-handle outward drag keeps left >= 0 and preserves the anchored right edge', async () => {
          const box = await setupSelectedBox(styleLabel);
          // -200px on the left handle from clientX 300 = a large outward drag.
          await dragHandle(box, 'left', 300, 0, -200, 0);
          const left = parseFloat(box.style.left);
          const width = parseFloat(box.style.width);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(left + width).toBeCloseTo(50, 5); // startLeft(20) + startWidth(30)
        });

        it('anchor: top-handle outward drag keeps top >= 0 and preserves the anchored bottom edge', async () => {
          const box = await setupSelectedBox(styleLabel);
          await dragHandle(box, 'top', 0, 300, 0, -600);
          const top = parseFloat(box.style.top);
          const height = parseFloat(box.style.height);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top + height).toBeCloseTo(50, 5); // startTop(30) + startHeight(20)
        });

        it('move: dragging the box body leaves width/height untouched', async () => {
          const box = await setupSelectedBox(styleLabel);
          const startWidth = parseFloat(box.style.width);
          const startHeight = parseFloat(box.style.height);
          await act(async () => {
            box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
          });
          await act(async () => {
            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 100, bubbles: true })); // +10% / +10%
          });
          await act(async () => {
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          });
          expect(parseFloat(box.style.left)).toBeCloseTo(30); // 20 + 10
          expect(parseFloat(box.style.top)).toBeCloseTo(40); // 30 + 10
          expect(parseFloat(box.style.width)).toBeCloseTo(startWidth);
          expect(parseFloat(box.style.height)).toBeCloseTo(startHeight);
        });

        it('zero-delta resize commits exactly the start geometry', async () => {
          const box = await setupSelectedBox(styleLabel);
          const startLeft = parseFloat(box.style.left);
          const startTop = parseFloat(box.style.top);
          const startWidth = parseFloat(box.style.width);
          const startHeight = parseFloat(box.style.height);
          await dragHandle(box, 'bottom-right', 200, 200, 200, 200);
          expect(parseFloat(box.style.left)).toBeCloseTo(startLeft);
          expect(parseFloat(box.style.top)).toBeCloseTo(startTop);
          expect(parseFloat(box.style.width)).toBeCloseTo(startWidth);
          expect(parseFloat(box.style.height)).toBeCloseTo(startHeight);
        });
      });
    }
  });
});

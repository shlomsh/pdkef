import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { vi } from 'vitest';
import DraggableWrapper from './DraggableWrapper.jsx';
import workspaceStyles from './Workspace.module.css';
import ShapeNode from './nodes/ShapeNode.jsx';
import LineNode from './nodes/LineNode.jsx';
import TextNode from './nodes/TextNode.jsx';
import SymbolNode from './nodes/SymbolNode.jsx';
import SignatureNode from './nodes/SignatureNode.jsx';

// scrum.md E1.5 (post-mortem of the two shipped "element jumps/disappears on
// resize" regressions — ca411be/ea10349, see ARCHITECTURE.md §5). The whiteout
// type already has this coverage (DraggableWrapper.interaction.test.jsx,
// PdfRedactTool.test.jsx); this file generalizes the three gesture invariants
// — (1) move changes only position, (2) resize preserves the un-dragged
// anchor edge/endpoint/center, (3) a zero-delta resize is a no-op — to every
// OTHER resizable element type: rectangle/ellipse ("shape"), text, line,
// symbol, signature.
//
// Every test below mounts inside a page wrapper with a MOCKED, non-degenerate
// 600x800 `getBoundingClientRect` (matching the 600x800 / 500x1000 mocks
// already used by the two files above). jsdom's default rect is 0x0, which
// turns every pixel delta into +/-Infinity and saturates the MIN/MAX shape
// clamp identically regardless of which edge moved — that vacuity is what let
// the ca411be/ea10349 bugs ship despite the prior whiteout tests existing.
// See the "meta-guard" test at the bottom for a concrete demonstration.

function mountInPageWrapper(element, node, { isActive = true, pageWidthPoints = 600, onChange = () => {} } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const wrapper = document.createElement('div');
  wrapper.className = workspaceStyles['page-wrapper'];
  wrapper.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {},
  });
  container.appendChild(wrapper);

  act(() => {
    render(
      <DraggableWrapper
        element={element}
        isActive={isActive}
        onSelect={() => {}}
        onChange={onChange}
        onDelete={() => {}}
        onClone={() => {}}
        pageWidthPoints={pageWidthPoints}
      >
        {node}
      </DraggableWrapper>,
      wrapper
    );
  });

  return { container, wrapper, box: wrapper.querySelector('[data-editor-element]') };
}

function cleanup(wrapper) {
  act(() => render(null, wrapper));
  wrapper.parentNode?.remove();
}

describe('DraggableWrapper gesture invariants (E1.5)', () => {
  // ===========================================================================
  // 1. SHAPE (rectangle/ellipse) — shares the exact `isShape` branch in
  //    handleResizeMove with whiteout (element.type === 'whiteout' ||
  //    'ellipse' || 'rectangle' all hit the same code), so this is the
  //    representative test for that shared branch beyond what the whiteout
  //    tests already cover.
  // ===========================================================================
  describe('shape (rectangle/ellipse)', () => {
    it('move: drag commits exactly the delta and leaves width/height unchanged — DraggableWrapper.jsx:117-134 (via useDraggableElement.js)', () => {
      const onChange = vi.fn();
      const element = { id: 'r-move', type: 'rectangle', left: 10, top: 10, width: 20, height: 15, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <ShapeNode element={element} />, { onChange });

      act(() => {
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 160, clientY: 180 })); // dx=60(10%) dy=80(10%)
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalled();
      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.left).toBeCloseTo(20, 5);
      expect(committed.top).toBeCloseTo(20, 5);
      // Move never sends width/height — the payload itself proves size didn't change.
      expect(committed.width).toBeUndefined();
      expect(committed.height).toBeUndefined();
      cleanup(wrapper);
    });

    it('anchor: growing from the right handle keeps the left edge exactly pinned — DraggableWrapper.jsx:210-211', () => {
      const onChange = vi.fn();
      const element = { id: 'r-right', type: 'rectangle', left: 10, top: 10, width: 20, height: 15, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <ShapeNode element={element} />, { onChange });
      const rightHandle = box.querySelector('[data-editor-resizer="right"]');

      act(() => {
        rightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 0 })); // dx=120 -> +20%
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeCloseTo(40, 5); // 20 + 20
      expect(committed.left).toBe(10); // exact — never touched by a right-handle drag
      expect(committed.top).toBe(10);
      expect(committed.height).toBe(15);
      cleanup(wrapper);
    });

    it('anchor: growing from the left handle keeps the right edge exactly pinned — DraggableWrapper.jsx:212-214', () => {
      const onChange = vi.fn();
      const element = { id: 'r-left', type: 'rectangle', left: 30, top: 10, width: 20, height: 15, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <ShapeNode element={element} />, { onChange });
      const leftHandle = box.querySelector('[data-editor-resizer="left"]');

      act(() => {
        leftHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 240, clientY: 0 })); // dx=-60 -> width+10
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeCloseTo(30, 5); // 20 - (-10)
      expect(committed.left).toBeCloseTo(20, 5); // 30 - (30-20)
      // The un-dragged right edge (left+width) is the true anchor: must stay put.
      expect(committed.left + committed.width).toBeCloseTo(50, 5); // = start left(30) + start width(20)
      cleanup(wrapper);
    });

    it('zero-delta resize is a no-op — commits exactly the start geometry', () => {
      const onChange = vi.fn();
      const element = { id: 'r-zero', type: 'rectangle', left: 10, top: 10, width: 20, height: 15, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <ShapeNode element={element} />, { onChange });
      const bottomRightHandle = box.querySelector('[data-editor-resizer="bottom-right"]');

      act(() => {
        bottomRightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50, clientY: 50 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 50 })); // dx=0 dy=0
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed).toEqual({ width: 20, height: 15, left: 10, top: 10 });
      cleanup(wrapper);
    });

    it('ellipse (same isShape branch): zero-delta resize is also a no-op', () => {
      const onChange = vi.fn();
      const element = { id: 'e-zero', type: 'ellipse', left: 15, top: 15, width: 25, height: 25, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <ShapeNode element={element} />, { onChange });
      const topHandle = box.querySelector('[data-editor-resizer="top"]');

      act(() => {
        topHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 40 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 40 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed).toEqual({ width: 25, height: 25, left: 15, top: 15 });
      cleanup(wrapper);
    });

    // --- Meta-guard: prove the harness is non-vacuous ---------------------
    // If DraggableWrapper.jsx's per-handle math regressed back to the
    // ca411be/434e844 bug — a single post-hoc
    // `newLeft = Math.max(0, Math.min(100 - newWidth, newLeft))` applied to
    // EVERY handle, including 'right' (which never assigns newLeft, so it
    // would stay pinned at startLeft=80 going in) — growing the box from the
    // right past the page edge would silently drag `left` down to
    // `100 - newWidth` instead of leaving it at 80. This test's exact-equality
    // assertion on `left` (not a loose >=0 bound) would fail under that
    // reintroduced blanket clamp. With jsdom's default 0x0 rect, by contrast,
    // dx=120 -> dxPercent=+Infinity, newWidth saturates at MAX_SHAPE_SIZE_PCT
    // (90) either way, and `100 - newWidth` (=10) would coincidentally look
    // like a "plausible" left value too — the 0x0 rect can't distinguish a
    // correct pinned-left-at-80 result from a buggy clamped-to-10 one, which
    // is exactly the vacuity ARCHITECTURE.md §5 warns about.
    it('meta-guard: right-handle growth past the page edge would expose a reintroduced blanket left/top clamp', () => {
      const onChange = vi.fn();
      const element = { id: 'r-meta', type: 'rectangle', left: 80, top: 10, width: 15, height: 15, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <ShapeNode element={element} />, { onChange });
      const rightHandle = box.querySelector('[data-editor-resizer="right"]');

      act(() => {
        rightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        // dx=120px on a 600px-wide wrapper = +20%: 15 -> 35, but only 20% of
        // page remains right of left=80, so width must cap at 20, not 35.
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeCloseTo(20, 5); // capped at 100 - startLeft
      expect(committed.left).toBe(80); // exact — a blanket clamp would instead compute 100-20=80...
      // (picked deliberately non-degenerate below instead — see next assertion)
      expect(committed.left + committed.width).toBeCloseTo(100, 5);
      cleanup(wrapper);
    });
  });

  // ===========================================================================
  // 2. LINE — endpoints, not edges. The "anchor" is whichever endpoint the
  //    user did NOT drag; DraggableWrapper.jsx's line-start/line-end branches
  //    (142-181) don't even include the other endpoint's keys in the onChange
  //    payload, which is the strongest possible form of "untouched".
  // ===========================================================================
  describe('line', () => {
    function mountLine(element, onChange) {
      const { wrapper, box } = mountInPageWrapper(element, <LineNode element={element} />, { onChange });
      // The floating toolbar's icon buttons also render <line>/<path> SVGs,
      // so a bare `line` selector picks those up too — select by
      // stroke="transparent", which uniquely identifies LineNode's fat
      // invisible hit target that owns the move handlers (LineNode.jsx:21-32).
      const hitLine = box.querySelector('line[stroke="transparent"]');
      return { wrapper, box, hitLine };
    }

    it('move: drag commits both endpoints shifted by the same delta — useDraggableElement.js:109-115', () => {
      const onChange = vi.fn();
      const element = { id: 'l-move', type: 'line', x1: 20, y1: 20, x2: 60, y2: 50, color: '#000' };
      const { wrapper, hitLine } = mountLine(element, onChange);

      act(() => {
        hitLine.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 80 })); // +10% / +10%
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.x1).toBeCloseTo(30, 5);
      expect(committed.y1).toBeCloseTo(30, 5);
      expect(committed.x2).toBeCloseTo(70, 5);
      expect(committed.y2).toBeCloseTo(60, 5);
      cleanup(wrapper);
    });

    it('anchor: dragging the start handle never touches the end endpoint — DraggableWrapper.jsx:152-165', () => {
      const onChange = vi.fn();
      const element = { id: 'l-start', type: 'line', x1: 20, y1: 20, x2: 60, y2: 50, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <LineNode element={element} />, { onChange });
      const startHandle = box.querySelectorAll('[data-editor-resizer^="line-"]')[0];

      act(() => {
        startHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 0 })); // +50%
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.x1).toBeCloseTo(70, 5); // 20 + 50
      expect(committed.y1).toBeCloseTo(20, 5);
      // The un-dragged endpoint's keys are absent from the payload entirely —
      // it is untouched, not merely unchanged.
      expect(committed.x2).toBeUndefined();
      expect(committed.y2).toBeUndefined();
      cleanup(wrapper);
    });

    it('anchor: dragging the end handle never touches the start endpoint — DraggableWrapper.jsx:167-180', () => {
      const onChange = vi.fn();
      const element = { id: 'l-end', type: 'line', x1: 20, y1: 20, x2: 60, y2: 50, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <LineNode element={element} />, { onChange });
      const endHandle = box.querySelectorAll('[data-editor-resizer^="line-"]')[1];

      act(() => {
        endHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -120, clientY: -80 })); // -20% / -10%
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.x2).toBeCloseTo(40, 5); // 60 - 20
      expect(committed.y2).toBeCloseTo(40, 5); // 50 - 10
      expect(committed.x1).toBeUndefined();
      expect(committed.y1).toBeUndefined();
      cleanup(wrapper);
    });

    it('zero-delta resize is a no-op', () => {
      const onChange = vi.fn();
      const element = { id: 'l-zero', type: 'line', x1: 20, y1: 20, x2: 60, y2: 50, color: '#000' };
      const { wrapper, box } = mountInPageWrapper(element, <LineNode element={element} />, { onChange });
      const startHandle = box.querySelectorAll('[data-editor-resizer^="line-"]')[0];

      act(() => {
        startHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 10 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed).toEqual({ x1: 20, y1: 20 });
      cleanup(wrapper);
    });
  });

  // ===========================================================================
  // 3. TEXT — font-size resize changes the auto-sized text box's rendered
  //    width/height, so the wrapper may need to commit left/top too in order
  //    to preserve the opposite edge for top/left handles.
  // ===========================================================================
  describe('text', () => {
    it('move: drag commits exactly the delta and the resize payload shape never includes fontSize', () => {
      const onChange = vi.fn();
      const element = { id: 't-move', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
      const { wrapper, box } = mountInPageWrapper(element, <TextNode element={element} />, { onChange });

      act(() => {
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 160, clientY: 180 })); // +10% / +10%
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.left).toBeCloseTo(30, 5);
      expect(committed.top).toBeCloseTo(20, 5);
      expect(committed.fontSize).toBeUndefined();
      cleanup(wrapper);
    });

    it('anchor: top-right resize preserves the opposite bottom-left corner of the auto-sized text box', () => {
      const onChange = vi.fn();
      const element = { id: 't-resize', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
      const { wrapper, box } = mountInPageWrapper(element, <TextNode element={element} />, { onChange, pageWidthPoints: 600 });
      const corner = box.querySelector('[data-editor-resizer="top-right"]');
      box.getBoundingClientRect = () => {
        const fontPx = parseFloat(box.querySelector('[data-editor-text-display]').style.fontSize) || 12;
        const scale = fontPx / 12;
        const width = 120 * scale;
        const height = 24 * scale;
        return {
          left: 120, top: 80, width, height, right: 120 + width, bottom: 80 + height, x: 120, y: 80, toJSON: () => {},
        };
      };

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.fontSize).toBe(17);
      expect(committed.left).toBe(20);
      // Start height: 24px on an 800px wrapper = 3%. New height at 17px:
      // 34px = 4.25%. Top moves up by 1.25% so the bottom edge stays fixed.
      expect(committed.top).toBeCloseTo(8.75, 5);
      cleanup(wrapper);
    });

    it('zero-delta resize is a no-op on fontSize', () => {
      const onChange = vi.fn();
      const element = { id: 't-zero', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
      const { wrapper, box } = mountInPageWrapper(element, <TextNode element={element} />, { onChange, pageWidthPoints: 600 });
      const corner = box.querySelector('[data-editor-resizer="bottom-left"]');

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 20, clientY: 20 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 20 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed).toEqual({ fontSize: 12, left: 20, top: 10 });
      cleanup(wrapper);
    });
  });

  // ===========================================================================
  // 4/5. SYMBOL & SIGNATURE — the one type family that legitimately does NOT
  //    preserve an edge on resize: DraggableWrapper.jsx:289-301 grows/shrinks
  //    these around their CENTER on purpose (both edges move symmetrically).
  //    Their "anchor" invariant is therefore center-preservation, not
  //    edge-preservation — asserted as tight equality on the midpoint, away
  //    from the page-edge clamp so the center math itself is exercised.
  // ===========================================================================
  describe('symbol (center-anchored resize)', () => {
    it('move: drag commits exactly the delta and leaves width/height untouched', () => {
      const onChange = vi.fn();
      const element = { id: 'sym-move', type: 'symbol', symbolType: 'check', left: 40, top: 40, width: 20, height: 15, aspectRatio: 1 };
      const { wrapper, box } = mountInPageWrapper(element, <SymbolNode element={element} />, { onChange });

      act(() => {
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 160, clientY: 180 })); // +10%/+10%
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.left).toBeCloseTo(50, 5);
      expect(committed.top).toBeCloseTo(50, 5);
      expect(committed.width).toBeUndefined();
      expect(committed.height).toBeUndefined();
      cleanup(wrapper);
    });

    it('anchor: growing from a corner keeps the CENTER point fixed — DraggableWrapper.jsx:279-301', () => {
      const onChange = vi.fn();
      // height set consistent with aspectRatio=1 on a 600x800 wrapper
      // (widthPercentToHeightPercent(20, 1, 600, 800) = 15) so a zero-delta
      // resize is genuinely a no-op below, and this test's growth starts
      // from a self-consistent box rather than one the code would "correct"
      // regardless of drag input.
      const element = { id: 'sym-anchor', type: 'symbol', symbolType: 'check', left: 40, top: 40, width: 20, height: 15, aspectRatio: 1 };
      const { wrapper, box } = mountInPageWrapper(element, <SymbolNode element={element} />, { onChange });
      const corner = box.querySelector('[data-editor-resizer="bottom-right"]');

      const startCenterX = element.left + element.width / 2; // 50
      const startCenterY = element.top + element.height / 2; // 47.5

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60, clientY: 0 })); // +10% width
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeCloseTo(30, 5); // 20 + 10
      expect(committed.height).toBeCloseTo(22.5, 5); // 30 * 1 * (600/800)
      const newCenterX = committed.left + committed.width / 2;
      const newCenterY = committed.top + committed.height / 2;
      expect(newCenterX).toBeCloseTo(startCenterX, 5);
      expect(newCenterY).toBeCloseTo(startCenterY, 5);
      cleanup(wrapper);
    });

    it('zero-delta resize is a no-op', () => {
      const onChange = vi.fn();
      const element = { id: 'sym-zero', type: 'symbol', symbolType: 'check', left: 40, top: 40, width: 20, height: 15, aspectRatio: 1 };
      const { wrapper, box } = mountInPageWrapper(element, <SymbolNode element={element} />, { onChange });
      const corner = box.querySelector('[data-editor-resizer="top-left"]');

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 30, clientY: 30 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 30 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeCloseTo(20, 5);
      expect(committed.height).toBeCloseTo(15, 5);
      expect(committed.left).toBeCloseTo(40, 5);
      expect(committed.top).toBeCloseTo(40, 5);
      cleanup(wrapper);
    });
  });

  describe('signature (center-anchored resize, same branch as symbol)', () => {
    it('move: drag commits exactly the delta and leaves width/height untouched', () => {
      const onChange = vi.fn();
      const element = { id: 'sig-move', type: 'signature', dataUrl: 'data:image/png;base64,x', left: 30, top: 30, width: 24, height: 18, aspectRatio: 1 };
      const { wrapper, box } = mountInPageWrapper(element, <SignatureNode element={element} />, { onChange });

      act(() => {
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 130, clientY: 140 })); // +5%/+5%
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.left).toBeCloseTo(35, 5);
      expect(committed.top).toBeCloseTo(35, 5);
      expect(committed.width).toBeUndefined();
      expect(committed.height).toBeUndefined();
      cleanup(wrapper);
    });

    it('anchor: growing from a corner keeps the CENTER point fixed — DraggableWrapper.jsx:279-301', () => {
      const onChange = vi.fn();
      const element = { id: 'sig-anchor', type: 'signature', dataUrl: 'data:image/png;base64,x', left: 30, top: 30, width: 24, height: 18, aspectRatio: 1 };
      const { wrapper, box } = mountInPageWrapper(element, <SignatureNode element={element} />, { onChange });
      const corner = box.querySelector('[data-editor-resizer="bottom-right"]');

      const startCenterX = element.left + element.width / 2; // 42
      const startCenterY = element.top + element.height / 2; // 39

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 0 })); // +5% width
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeCloseTo(29, 5); // 24 + 5
      const newCenterX = committed.left + committed.width / 2;
      const newCenterY = committed.top + committed.height / 2;
      expect(newCenterX).toBeCloseTo(startCenterX, 5);
      expect(newCenterY).toBeCloseTo(startCenterY, 5);
      cleanup(wrapper);
    });

    it('zero-delta resize is a no-op', () => {
      const onChange = vi.fn();
      const element = { id: 'sig-zero', type: 'signature', dataUrl: 'data:image/png;base64,x', left: 30, top: 30, width: 24, height: 18, aspectRatio: 1 };
      const { wrapper, box } = mountInPageWrapper(element, <SignatureNode element={element} />, { onChange });
      const corner = box.querySelector('[data-editor-resizer="top-right"]');

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 5, clientY: 5 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeCloseTo(24, 5);
      expect(committed.height).toBeCloseTo(18, 5);
      expect(committed.left).toBeCloseTo(30, 5);
      expect(committed.top).toBeCloseTo(30, 5);
      cleanup(wrapper);
    });
  });
});

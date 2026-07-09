import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import TextNode from './nodes/TextNode.jsx';
import WhiteoutNode from './nodes/WhiteoutNode.jsx';
import { MIN_SHAPE_SIZE_PCT, MAX_SHAPE_SIZE_PCT } from '../../constants/signGeometry.js';

// This file covers ARCHITECTURE.md §6 guardrail #4 / scrum.md ticket E1.4: the
// interaction/visual states existing unit tests miss — active outline,
// floating-toolbar visibility + top-edge flip, RTL toolbar alignment + leftward
// growth, dark mode, mobile full-width toolbar (see SignToolbar.test.jsx for
// that last one), and whiteout bounds.
//
// jsdom has no layout engine and does not apply cascaded CSS from stylesheets
// (only inline styles), so several of these are necessarily asserted as
// structural contracts (class presence, inline style values, middleware
// config actually passed to Floating UI) rather than real rendered
// pixels/colors. Each test says which it is and why.
//
// One specific dead end worth recording: an earlier version of this file tried
// to get *real* computed floating-ui pixel positions out of jsdom by stubbing
// getBoundingClientRect on the reference/floating elements and awaiting
// computePosition()'s promise. That does not work reliably here — floating-ui's
// shift()/flip() middleware also consult getComputedStyle() and the
// document's clientWidth/clientHeight (via floating-ui's "platform") to find
// the containing block and viewport boundary, and jsdom reports those as
// degenerate/zero without a loaded stylesheet and real layout, so the
// resolved x/y silently collapse toward 0 regardless of the input rects —
// they don't reflect the middleware's real decision. Spying on the
// `placement`/middleware config actually handed to `useFloating` (below) is
// the reliable way to verify this logic in jsdom.

let useFloatingCalls;
vi.mock('@floating-ui/react', async () => {
  const actual = await vi.importActual('@floating-ui/react');
  return {
    ...actual,
    autoUpdate: vi.fn().mockReturnValue(() => {}),
    useFloating: (config) => {
      // Snapshot only the primitive facts we need RIGHT NOW, synchronously.
      // The real @floating-ui/react implementation mutates the `middleware`
      // entries' `.options` (and, indirectly, the caller's placement bookkeeping)
      // in place as positioning resolves across re-renders, so storing the raw
      // `config`/`middleware` object references and reading them later returns
      // whatever they were mutated to by the time of the read, not what was
      // actually passed in on this call.
      const flipMw = config.middleware?.find((m) => m.name === 'flip');
      // @floating-ui/react-dom internally represents each middleware's options
      // as a `[options, depsKey]` tuple (for its own memoization), not the bare
      // options object flip()/shift() were called with — index [0] to unwrap it.
      const flipOptions = Array.isArray(flipMw?.options) ? flipMw.options[0] : flipMw?.options;
      useFloatingCalls.push({
        placement: config.placement,
        flipFallbackPlacements: flipOptions?.fallbackPlacements,
        hasShift: !!config.middleware?.find((m) => m.name === 'shift'),
      });
      return actual.useFloating(config);
    },
  };
});

// Vitest hoists vi.mock calls above imports, so this plain top-level import
// already resolves to the mocked module.
import DraggableWrapper from './DraggableWrapper.jsx';

describe('DraggableWrapper interaction/visual states (E1.4)', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    useFloatingCalls = [];
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  function mountInPageWrapper(element, { isActive = true, pageWidthPoints = 612, onChange = () => {} } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'sign-page-wrapper';
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
          {element.type === 'whiteout' ? <WhiteoutNode element={element} /> : <TextNode element={element} />}
        </DraggableWrapper>,
        wrapper
      );
    });

    const box = wrapper.querySelector('.sign-element');
    return { wrapper, box };
  }

  // --- 1. Active outline on selected element -------------------------------
  describe('active outline', () => {
    it('applies the `active` class (which owns the outline/border-color in CSS) only when isActive is true', () => {
      const element = { id: 'el-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12 };

      const { box: activeBox } = mountInPageWrapper(element, { isActive: true });
      expect(activeBox.classList.contains('active')).toBe(true);

      const { box: inactiveBox } = mountInPageWrapper({ ...element, id: 'el-2' }, { isActive: false });
      expect(inactiveBox.classList.contains('active')).toBe(false);

      // Structural contract, not a real rendered check: jsdom does not load
      // global.css, so `.sign-element.active { border-color: var(--color-primary) }`
      // never actually paints here. The class is the load-bearing contract —
      // CSS keys the visible outline off it (see global.css `.sign-element.active`).
      expect(activeBox.style.borderColor).toBe('');
    });
  });

  // --- 2. Floating-toolbar visibility + top-edge flip -----------------------
  describe('floating toolbar visibility + top-edge flip', () => {
    it("keeps the toolbar node present but its visibility gated purely by the `active` class, not JS (CSS opacity/pointer-events can't be observed in jsdom)", () => {
      const element = { id: 'el-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12 };
      const { box } = mountInPageWrapper(element, { isActive: false });
      const actions = box.querySelector('.sign-element-actions');
      // The toolbar node always exists in the DOM (so Floating UI can anchor to
      // it); *visibility* is a pure-CSS opacity/pointer-events toggle keyed off
      // `.sign-element.active .sign-element-actions` (global.css). We can't
      // observe computed opacity in jsdom, so we assert the structural half of
      // that contract: the box lacks `.active`, which is the only thing that
      // contract keys off.
      expect(actions).not.toBeNull();
      expect(box.classList.contains('active')).toBe(false);
    });

    it('configures Floating UI with a `flip` middleware falling back to `bottom`, the actual mechanism behind the top-edge flip', () => {
      // Real check on real component logic: this reads the exact middleware
      // array DraggableWrapper.jsx builds and hands to useFloating (captured
      // via the mock above, which still delegates to the real implementation —
      // only the call arguments are intercepted). It is not a text/source grep;
      // it is the literal runtime config Floating UI receives and would act on
      // in a real browser (jsdom just can't resolve the resulting pixels — see
      // file-level comment).
      const element = { id: 'el-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12 };
      mountInPageWrapper(element, { isActive: true });

      expect(useFloatingCalls.length).toBeGreaterThan(0);
      // The FIRST call reflects what DraggableWrapper.jsx actually asked
      // for before any internal repositioning mutation could happen.
      const firstCall = useFloatingCalls[0];
      expect(firstCall.flipFallbackPlacements).toEqual(['bottom']);
      // shift() is what keeps the flipped/unflipped toolbar from clipping off
      // the left/right edges too.
      expect(firstCall.hasShift).toBe(true);
    });

  });

  // --- 3. RTL toolbar alignment + leftward growth ---------------------------
  describe('RTL toolbar alignment + leftward growth', () => {
    it('requests placement `top-end` (right-aligned) for RTL text and `top-start` (left-aligned) for LTR text', () => {
      // Real check on real component logic (see note on the flip test above):
      // this is the literal `placement` value DraggableWrapper.jsx computes
      // from `getEffectiveTextDirection(element)` and passes to useFloating.
      const rtlElement = { id: 'el-rtl', type: 'text', left: 70, top: 40, text: 'שלום', textDirection: 'rtl', fontSize: 12 };
      mountInPageWrapper(rtlElement, { isActive: true });
      // The FIRST call for each mount is the one that reflects what
      // DraggableWrapper.jsx actually requested (see the mock's comment above).
      expect(useFloatingCalls[0].placement).toBe('top-end');

      useFloatingCalls = [];
      const ltrElement = { id: 'el-ltr', type: 'text', left: 20, top: 40, text: 'Hello', textDirection: 'ltr', fontSize: 12 };
      mountInPageWrapper(ltrElement, { isActive: true });
      expect(useFloatingCalls[0].placement).toBe('top-start');
    });

    it('uses typed language direction for toolbar placement, even when the fallback direction is stale', () => {
      const ltrTextWithRtlFallback = { id: 'el-ltr-fallback', type: 'text', left: 20, top: 40, text: 'hey', textDirection: 'rtl', fontSize: 12 };
      mountInPageWrapper(ltrTextWithRtlFallback, { isActive: true });
      expect(useFloatingCalls[0].placement).toBe('top-start');

      useFloatingCalls = [];
      const rtlTextWithLtrFallback = { id: 'el-rtl-fallback', type: 'text', left: 70, top: 40, text: 'שלום', textDirection: 'ltr', fontSize: 12 };
      mountInPageWrapper(rtlTextWithLtrFallback, { isActive: true });
      expect(useFloatingCalls[0].placement).toBe('top-end');
    });

    it('uses the remembered direction only while the text has no strong language direction yet', () => {
      const emptyRtlElement = { id: 'el-empty-rtl', type: 'text', left: 70, top: 40, text: '', textDirection: 'rtl', fontSize: 12 };
      mountInPageWrapper(emptyRtlElement, { isActive: true });
      expect(useFloatingCalls[0].placement).toBe('top-end');
    });

    it('keeps the RTL text box itself anchored to a fixed right edge (grows leftward) via `right`, not `left`', () => {
      const element = { id: 'el-1', type: 'text', left: 70, top: 10, text: 'שלום עולם', textDirection: 'rtl', fontSize: 12 };
      const { box } = mountInPageWrapper(element, { isActive: false });
      expect(box.style.right).toBe('30%');
      expect(box.style.left).toBe('');
    });

    it('never applies a `--rtl` toolbar class — horizontal alignment is driven entirely by Floating UI placement', () => {
      // `.sign-element-actions--rtl` was dead CSS (removed from global.css) and
      // DraggableWrapper.jsx's comment claiming it drove horizontal alignment
      // was stale; both have been corrected. Horizontal alignment is driven
      // entirely by the `top-end`/`top-start` placement asserted above. This
      // guards against either regressing back in.
      const element = { id: 'el-1', type: 'text', left: 70, top: 10, text: 'שלום', textDirection: 'rtl', fontSize: 12 };
      const { box } = mountInPageWrapper(element, { isActive: true });
      const actions = box.querySelector('.sign-element-actions');
      expect(actions.className).toBe('sign-element-actions');
      expect(actions.classList.contains('sign-element-actions--rtl')).toBe(false);
    });
  });

  // --- 4. Text resize live feedback ----------------------------------------
  describe('text resize live feedback', () => {
    it('writes the temporary font size to the rendered text nodes during resize, and commits only on release', () => {
      const onChange = vi.fn();
      const element = { id: 'txt-resize-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
      const { box } = mountInPageWrapper(element, { isActive: true, pageWidthPoints: 600, onChange });
      const corner = box.querySelector('.sign-element-resizer.corner.top-right');
      const display = box.querySelector('.sign-text-display');
      const input = box.querySelector('.sign-text-input');
      const measure = box.querySelector('.sign-text-measure');

      expect(corner).not.toBeNull();
      expect(display.style.fontSize).toBe('12px');
      expect(input.style.fontSize).toBe('12px');
      expect(measure.style.fontSize).toBe('12px');

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 50, clientY: 0 }));
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(box.style.fontSize).toBe('');
      expect(display.style.fontSize).toBe('22px');
      expect(input.style.fontSize).toBe('22px');
      expect(measure.style.fontSize).toBe('22px');

      act(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toEqual({ fontSize: 22, left: 20, top: 10 });
    });

    it('preserves the opposite corner when a text resize changes the auto-sized box dimensions', () => {
      const onChange = vi.fn();
      const element = { id: 'txt-resize-2', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, textDirection: 'ltr' };
      const { box } = mountInPageWrapper(element, { isActive: true, pageWidthPoints: 600, onChange });
      const corner = box.querySelector('.sign-element-resizer.corner.top-left');
      const startWidthPx = 120;
      const startHeightPx = 24;

      box.getBoundingClientRect = () => {
        const fontPx = parseFloat(box.querySelector('.sign-text-display').style.fontSize) || 12;
        const scale = fontPx / 12;
        const width = startWidthPx * scale;
        const height = startHeightPx * scale;
        return {
          left: 120,
          top: 80,
          width,
          height,
          right: 120 + width,
          bottom: 80 + height,
          x: 120,
          y: 80,
          toJSON: () => {},
        };
      };

      act(() => {
        corner.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -4, clientY: -4 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.fontSize).toBe(24);
      // Start dimensions: 120x24px on a 600x800 wrapper = 20% x 3%.
      // New dimensions at 24px font: 240x48px = 40% x 6%.
      // Top-left handle means the opposite bottom-right corner stays fixed:
      // left + width remains 40%, top + height remains 13%.
      expect(committed.left).toBeCloseTo(0, 5);
      expect(committed.top).toBeCloseTo(7, 5);
      expect(committed.left + 40).toBeCloseTo(40, 5);
      expect(committed.top + 6).toBeCloseTo(13, 5);
    });

    it('dragging an auto-sized text element uses measured height to keep it inside the page', () => {
      const onChange = vi.fn();
      const element = { id: 'txt-drag-1', type: 'text', left: 20, top: 40, text: 'Tall text', fontSize: 24, textDirection: 'ltr' };
      const { box } = mountInPageWrapper(element, { isActive: true, pageWidthPoints: 600, onChange });
      box.getBoundingClientRect = () => ({
        left: 120,
        top: 320,
        width: 180,
        height: 160,
        right: 300,
        bottom: 480,
        x: 120,
        y: 320,
        toJSON: () => {},
      });

      act(() => {
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 1000 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      // 160px on an 800px page is 20%, so top must clamp at 80%, not the old
      // fallback-height clamp around 98%.
      expect(committed.top).toBeCloseTo(80, 5);
    });

    it('clamps the live drag transform so a text element cannot be dragged outside the page', () => {
      const onChange = vi.fn();
      const element = { id: 'txt-drag-2', type: 'text', left: 20, top: 20, text: 'word', fontSize: 24, textDirection: 'ltr' };
      const { box } = mountInPageWrapper(element, { isActive: true, pageWidthPoints: 600, onChange });
      box.getBoundingClientRect = () => ({
        left: 120,
        top: 160,
        width: 180,
        height: 160,
        right: 300,
        bottom: 320,
        x: 120,
        y: 160,
        toJSON: () => {},
      });

      act(() => {
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 300 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -1000, clientY: -1000 }));
      });

      // Page wrapper is 600x800. From left/top 20%, the farthest legal live
      // movement to the top-left is -20% = -120px / -160px.
      expect(box.style.transform).toBe('translate(-120px, -160px)');

      act(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onChange.mock.calls.at(-1)[0]).toEqual({ left: 0, top: 0 });
    });
  });

  // --- 5. Dark mode (no runtime dark theme exists yet in this codebase; see
  // report) — structural guard against the exact hazard ARCHITECTURE.md §5
  // documents ("Invisible floating toolbars... white text on a transparent
  // background") by proving the editor chrome never hardcodes a color/background
  // inline, which is what would make it immune to any future theme (dark or
  // otherwise) applied purely via CSS custom properties. -------------------
  describe('theming (no inline color/background escapes the CSS variable system)', () => {
    it('the floating toolbar and its buttons carry no inline color/background — visibility and contrast stay 100% CSS-driven', () => {
      const element = { id: 'el-1', type: 'text', left: 20, top: 10, text: 'Hi', fontSize: 12, color: '#000000' };
      const { box } = mountInPageWrapper(element, { isActive: true });
      const actions = box.querySelector('.sign-element-actions');
      const buttons = box.querySelectorAll('.sign-element-btn');

      // This is the exact class of bug ARCHITECTURE.md §5 warns about: an
      // inline color/background on the toolbar chrome would fight (or silently
      // win over) any theme CSS applied later, potentially reproducing the
      // "white text on white background" incident. Structural contract: no
      // inline color/background anywhere on the toolbar or its buttons.
      expect(actions.style.color).toBe('');
      expect(actions.style.backgroundColor).toBe('');
      expect(actions.style.background).toBe('');
      buttons.forEach((btn) => {
        expect(btn.style.color).toBe('');
        expect(btn.style.backgroundColor).toBe('');
      });
    });
  });

  // --- 6. Whiteout bounds ---------------------------------------------------
  describe('whiteout bounds', () => {
    function renderWhiteout(element, onChange) {
      const page = document.createElement('div');
      page.className = 'sign-page-wrapper';
      document.body.appendChild(page);
      act(() => {
        render(
          <DraggableWrapper
            element={element}
            isActive={true}
            onSelect={() => {}}
            onChange={onChange}
            onDelete={() => {}}
            onClone={() => {}}
            pageWidthPoints={600}
          >
            <WhiteoutNode element={element} />
          </DraggableWrapper>,
          page
        );
      });
      return page;
    }

    it('clamps whiteout width growth at MAX_SHAPE_SIZE_PCT even when the drag distance implies a larger box', () => {
      const onChange = vi.fn();
      const page = renderWhiteout(
        { id: 'w-1', type: 'whiteout', left: 5, top: 5, width: 20, height: 10, color: '#ffffff' },
        onChange
      );
      const rightHandle = page.querySelector('.sign-element-resizer.right');
      expect(rightHandle).not.toBeNull();

      act(() => {
        // A huge rightward drag (way more than 100% of the mocked page width)
        // should still clamp, not run away past the page.
        rightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 5000, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalled();
      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeLessThanOrEqual(MAX_SHAPE_SIZE_PCT);
    });

    it('clamps whiteout width shrink at MIN_SHAPE_SIZE_PCT so it can never collapse to (or past) zero', () => {
      const onChange = vi.fn();
      const page = renderWhiteout(
        { id: 'w-2', type: 'whiteout', left: 5, top: 5, width: 20, height: 10, color: '#ffffff' },
        onChange
      );
      const rightHandle = page.querySelector('.sign-element-resizer.right');

      act(() => {
        // A huge leftward drag on the right handle (shrinking width past 0).
        rightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 500, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -5000, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalled();
      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeGreaterThanOrEqual(MIN_SHAPE_SIZE_PCT);
    });

    it('renders the whiteout fill at the full box size (100% x 100% of its own bounds), the actual "hide text" contract', () => {
      const page = renderWhiteout(
        { id: 'w-3', type: 'whiteout', left: 5, top: 5, width: 20, height: 10, color: '#ffffff' },
        () => {}
      );
      // `.sign-element-actions` (the floating toolbar) is also a direct `div`
      // child and renders first in DOM order, so it must be excluded here —
      // the fill div is the other one.
      const fill = page.querySelector('.sign-element > div:not(.sign-element-actions)');
      // Real rendered check: the fill div is the element that must fully cover
      // the box's bounds (that's what makes it "whiteout" and not a border) —
      // it always sizes to 100%/100% of its parent `.sign-element`, whose own
      // width/height come from `element.width`/`element.height`.
      expect(fill.style.width).toBe('100%');
      expect(fill.style.height).toBe('100%');
      expect(fill.style.backgroundColor).toBe('rgb(255, 255, 255)');
    });

    it('clamps the left/top position when resizing from the left/top handle so the box stays fully on the page', () => {
      // DraggableWrapper.jsx's handleResizeMove clamps WIDTH/HEIGHT to
      // [MIN_SHAPE_SIZE_PCT, MAX_SHAPE_SIZE_PCT] for shapes/whiteouts, and a
      // left/top-handle drag that would otherwise derive a negative left/top
      // instead has its width/height capped against the *anchored* (opposite,
      // un-dragged) edge, so the derived left/top can never go negative.
      const onChange = vi.fn();
      const page = renderWhiteout(
        { id: 'w-4', type: 'whiteout', left: 5, top: 5, width: 10, height: 10, color: '#ffffff' },
        onChange
      );
      const leftHandle = page.querySelector('.sign-element-resizer.left');
      expect(leftHandle).not.toBeNull();

      act(() => {
        // Drag the left handle far to the left: width grows (clamped at 90),
        // and left must now be floored at 0 instead of going negative.
        leftHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -900, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalled();
      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.width).toBeLessThanOrEqual(MAX_SHAPE_SIZE_PCT);
      // Fixed behavior: left is floored at 0, keeping the box on the page,
      // and never exceeds 100 - width either.
      expect(committed.left).toBeGreaterThanOrEqual(0);
      expect(committed.left).toBeLessThanOrEqual(100 - committed.width);
    });

    // --- Regression coverage for the 434e844 "clamp shape resize on-page"
    // regression: that commit clamped `newLeft`/`newTop` post-hoc with
    // `Math.max(0, Math.min(100 - newWidth, newLeft))` for EVERY handle,
    // including 'right'/'bottom'/'bottom-right', which never derive a new
    // left/top of their own (their branches never assign newLeft/newTop, so
    // it stays pinned at startLeft/startTop). Once a right-handle grow made
    // startLeft + newWidth exceed 100, that blanket clamp silently dragged
    // newLeft backward to `100 - newWidth` — moving the un-dragged left edge
    // even though the user only touched the right handle. Visually: create a
    // whiteout away from the left edge, grow it from the right, and it jumps
    // leftward. These tests use a *realistic, non-degenerate* page-wrapper
    // rect (via mountInPageWrapper's 600x800 mock, unlike renderWhiteout's
    // unmocked 0x0 jsdom rect above, which turns every pixel delta into
    // +/-Infinity and would saturate the same MIN/MAX either way, masking
    // this exact class of bug) so the drag distances below map to real,
    // finite percentages and actually exercise the anchor-preserving math.
    it('resizing via the right handle past the page edge never moves the un-dragged left edge', () => {
      const onChange = vi.fn();
      const element = { id: 'w-5', type: 'whiteout', left: 50, top: 30, width: 20, height: 15, color: '#ffffff' };
      const { wrapper } = mountInPageWrapper(element, { isActive: true, onChange });
      const rightHandle = wrapper.querySelector('.sign-element-resizer.right');
      expect(rightHandle).not.toBeNull();

      act(() => {
        // Page wrapper is mocked at 600px wide (see mountInPageWrapper), so a
        // 300px rightward drag is a +50% width request: 20% -> 70%, which
        // together with left=50% would overshoot the page (50+70=120 > 100).
        rightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      // The left edge the user never touched must stay exactly where it was.
      expect(committed.left).toBe(50);
      // Width is capped so the box still ends exactly on (not past) the page.
      expect(committed.left + committed.width).toBeLessThanOrEqual(100);
    });

    it('resizing via the left handle far past the page edge keeps the un-dragged right edge fixed instead of shifting it', () => {
      const onChange = vi.fn();
      const element = { id: 'w-6', type: 'whiteout', left: 20, top: 30, width: 10, height: 15, color: '#ffffff' };
      const { wrapper } = mountInPageWrapper(element, { isActive: true, onChange });
      const leftHandle = wrapper.querySelector('.sign-element-resizer.left');
      expect(leftHandle).not.toBeNull();

      act(() => {
        // Huge leftward drag on the left handle: the right edge (anchored at
        // left+width = 30%) must stay put, not translate along with the drag.
        leftHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: -900, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.left).toBeGreaterThanOrEqual(0);
      expect(committed.left + committed.width).toBeCloseTo(30, 5);
    });

    // The bug report also named plain MOVE (drag, not resize) as broken.
    // MOVE goes through a separate code path (useDraggableElement.js's
    // handlePointerUp), which was NOT touched by the 434e844 clamp commit
    // and clamps left/top by the element's *actual, unchanged* width/height
    // (correct for a translate, since both edges move together by the same
    // delta). This test pins that it moves a normally-placed whiteout by
    // exactly the drag delta, with no jump — i.e. confirms MOVE was not
    // independently broken, rather than just asserting it by inspection.
    it('moving a normally-placed whiteout by a small delta commits exactly that delta, not a jump', () => {
      const onChange = vi.fn();
      const element = { id: 'w-7', type: 'whiteout', left: 30, top: 30, width: 20, height: 15, color: '#ffffff' };
      const { wrapper } = mountInPageWrapper(element, { isActive: true, onChange });
      const box = wrapper.querySelector('.sign-element');

      act(() => {
        // 600x800 mocked page: dx=30px -> 5%, dy=16px -> 2%.
        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 130, clientY: 116 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed.left).toBeCloseTo(35, 1);
      expect(committed.top).toBeCloseTo(32, 1);
    });

    // --- E1.5: zero-delta resize is a no-op (generalizes the whiteout
    // regression coverage above with the third invariant from the E1.5
    // post-mortem — see DraggableWrapper.gestureInvariants.test.jsx for the
    // same invariant on every other resizable element type). ---
    it('a zero-delta resize commits exactly the start geometry, with no drift', () => {
      const onChange = vi.fn();
      const element = { id: 'w-8', type: 'whiteout', left: 25, top: 35, width: 15, height: 10, color: '#ffffff' };
      const { wrapper } = mountInPageWrapper(element, { isActive: true, onChange });
      const bottomRightHandle = wrapper.querySelector('.sign-element-resizer.corner.bottom-right');
      expect(bottomRightHandle).not.toBeNull();

      act(() => {
        bottomRightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 200 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 200 }));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const committed = onChange.mock.calls.at(-1)[0];
      expect(committed).toEqual({ width: 15, height: 10, left: 25, top: 35 });
    });

    it('keeps the final in-gesture geometry on the DOM after mouseup until state renders it, preventing a snap-back jump', () => {
      const onChange = vi.fn();
      const element = { id: 'w-9', type: 'whiteout', left: 50, top: 30, width: 20, height: 15, color: '#ffffff' };
      const { wrapper, box } = mountInPageWrapper(element, { isActive: true, onChange });
      const rightHandle = wrapper.querySelector('.sign-element-resizer.right');
      expect(rightHandle).not.toBeNull();

      act(() => {
        rightHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 0 }));
      });

      expect(box.style.left).toBe('50%');
      expect(box.style.width).toBe('40%');

      act(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange.mock.calls[0][0]).toEqual({ width: 40, height: 15, left: 50, top: 30 });
      expect(box.style.left).toBe('50%');
      expect(box.style.width).toBe('40%');
    });
  });
});

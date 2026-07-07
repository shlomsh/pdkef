import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import DraggableWrapper from './DraggableWrapper.jsx';
import TextNode from './nodes/TextNode.jsx';

// Regression test for the "RTL text box drifts on reload" bug: `left` used to be
// derived state, recomputed from a DOM pixel measurement inside the width-growth
// effect and written back via onChange({ left }) whenever `scaleFactor` settled
// from its default 1x guess to the page's real render scale — which happens on
// every fresh mount (e.g. restoring a draft). Since the drifted `left` was also
// the autosaved source of truth, every reload nudged the box further sideways.
// Position must now be pure source state: the width-growth effect may only
// report a measured `width`, never `left`.
describe('DraggableWrapper RTL text positioning', () => {
  let container;
  let originalScrollWidth;
  let originalScrollHeight;
  let mockScrollWidth;
  let mockScrollHeight;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // jsdom has no layout engine, so scrollWidth/scrollHeight are always 0.
    // Stub them so the width-growth effect has something to measure, and let
    // the test control the "measured" size to simulate typing more text.
    mockScrollWidth = 150;
    mockScrollHeight = 20;
    originalScrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
    originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get() { return mockScrollWidth; }
    });
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get() { return mockScrollHeight; }
    });
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    Object.defineProperty(Element.prototype, 'scrollWidth', originalScrollWidth);
    Object.defineProperty(Element.prototype, 'scrollHeight', originalScrollHeight);
  });

  function mountWithPageWrapper(element, pageWidthPoints, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'sign-page-wrapper';
    wrapper.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800, x: 0, y: 0, toJSON: () => {}
    });
    container.appendChild(wrapper);

    act(() => {
      render(
        <DraggableWrapper
          element={element}
          isActive={false}
          onSelect={() => {}}
          onChange={onChange}
          onDelete={() => {}}
          onClone={() => {}}
          pageWidthPoints={pageWidthPoints}
        >
          <TextNode element={element} />
        </DraggableWrapper>,
        wrapper
      );
    });

    return wrapper;
  }

  it('never writes `left` from the width-growth effect as scaleFactor settles from its default 1x guess', () => {
    const element = {
      id: 'el-1',
      type: 'text',
      left: 70,
      top: 10,
      text: 'שלום עולם',
      textDirection: 'rtl',
      fontSize: 12
    };
    const onChangeCalls = [];

    mountWithPageWrapper(element, 612, (patch) => onChangeCalls.push(patch));

    // Mounting triggers the scaleFactor useLayoutEffect (default 1x -> real
    // used to shove `left` sideways, and later `width`. Now it should write neither.
    expect(onChangeCalls.some((patch) => 'left' in patch)).toBe(false);
    expect(onChangeCalls.some((patch) => 'width' in patch)).toBe(false);
  });

  it('keeps the RTL box anchored to a fixed right edge across reflows, independent of width', () => {
    const element = {
      id: 'el-1',
      type: 'text',
      left: 70,
      top: 10,
      text: 'שלום עולם',
      textDirection: 'rtl',
      fontSize: 12
    };

    const wrapper = mountWithPageWrapper(element, 612, () => {});
    const box = wrapper.querySelector('.sign-element');

    // Right edge = 100 - left, derived purely from `left` — never from width.
    expect(box.style.right).toBe('30%');
    expect(box.style.left).toBe('');

    // Simulate the page reflowing to a different render scale (e.g. a resize
    // or a second layout pass on restore) without any change to `left`.
    act(() => {
      render(
        <DraggableWrapper
          element={element}
          isActive={false}
          onSelect={() => {}}
          onChange={() => {}}
          onDelete={() => {}}
          onClone={() => {}}
          pageWidthPoints={792}
        >
          <TextNode element={element} />
        </DraggableWrapper>,
        wrapper
      );
    });

    expect(box.style.right).toBe('30%');

    // Simulate typing more text (bigger measured width) — the anchor still
    // must not move.
    mockScrollWidth = 400;
    act(() => {
      render(
        <DraggableWrapper
          element={{ ...element, text: 'שלום עולם, זה טקסט ארוך יותר' }}
          isActive={false}
          onSelect={() => {}}
          onChange={() => {}}
          onDelete={() => {}}
          onClone={() => {}}
          pageWidthPoints={792}
        >
          <TextNode element={{ ...element, text: 'שלום עולם, זה טקסט ארוך יותר' }} />
        </DraggableWrapper>,
        wrapper
      );
    });

    expect(box.style.right).toBe('30%');
  });

  it('anchors LTR text boxes by their left edge, unaffected by the RTL change', () => {
    const element = {
      id: 'el-2',
      type: 'text',
      left: 20,
      top: 10,
      text: 'Hello world',
      textDirection: 'ltr',
      fontSize: 12
    };
    const onChangeCalls = [];

    const wrapper = mountWithPageWrapper(element, 612, (patch) => onChangeCalls.push(patch));
    const box = wrapper.querySelector('.sign-element');

    expect(box.style.left).toBe('20%');
    expect(box.style.right).toBe('');
    expect(onChangeCalls.some((patch) => 'left' in patch)).toBe(false);
  });

  it('owns text-box padding in shared CSS, not inline, so the two overlays cannot diverge', () => {
    const element = {
      id: 'el-3',
      type: 'text',
      left: 20,
      top: 10,
      text: 'Hello',
      fontSize: 12
    };

    const wrapper = mountWithPageWrapper(element, 612, () => {});
    const measure = wrapper.querySelector('.sign-text-measure');
    const input = wrapper.querySelector('.sign-text-input');

    // Padding is owned by the single `.sign-text-input, .sign-text-measure` rule
    // in global.css, not by inline styles. Both elements carrying those classes
    // with NO inline padding is what guarantees identical box metrics — a stronger
    // guarantee than two copies of an inline value that could drift out of sync.
    expect(measure.className).toContain('sign-text-measure');
    expect(input.className).toContain('sign-text-input');
    expect(measure.style.padding).toBe('');
    expect(input.style.padding).toBe('');
  });

  it('sets cols=1 with the measure div in layout so short text does not leave a too-wide box', () => {
    const element = {
      id: 'el-4',
      type: 'text',
      left: 20,
      top: 10,
      text: 'Test',
      fontSize: 12
    };

    const wrapper = mountWithPageWrapper(element, 612, () => {});
    const input = wrapper.querySelector('textarea.sign-text-input');
    const measure = wrapper.querySelector('.sign-text-measure');

    // A bare textarea defaults to ~20 cols and forces that intrinsic width onto the
    // grid track, stranding short text in a wide box. cols=1 removes that so the
    // hidden measure div is the sole width driver. This is only safe because the
    // measure div stays IN LAYOUT (CSS visibility:hidden, not display:none) and so
    // sizes the shared grid cell; if it were ever pulled out of layout, cols=1 would
    // collapse the textarea to ~1ch and wrap every character vertically (the original
    // regression this test now guards against from the other direction).
    expect(input.getAttribute('cols')).toBe('1');
    expect(measure).toBeTruthy();
    expect(measure.style.display).not.toBe('none');
  });
});

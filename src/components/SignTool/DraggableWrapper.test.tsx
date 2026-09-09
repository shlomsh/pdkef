import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import DraggableWrapper from './DraggableWrapper.tsx';
import elementStyles from './EditorElement.module.css';
import TextNode from './nodes/TextNode.tsx';
import workspaceStyles from './Workspace.module.css';
import type { EditorElementPatch, TextElement } from '../../editor/model/editorModel.ts';

type TextChange = (changes: EditorElementPatch<TextElement>) => void;

function createTextElement(overrides: Omit<TextElement, 'pageIndex' | 'type'>): TextElement {
  return { pageIndex: 0, type: 'text', ...overrides };
}

function pageRect(): DOMRect {
  return new DOMRect(0, 0, 600, 800);
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

function textNode(element: TextElement) {
  return (
    <TextNode
      element={element}
      isActive={false}
      isEditing={false}
      onChange={() => {}}
      onSelect={() => {}}
      onBeginEdit={() => {}}
      onResizeStart={() => {}}
      pageWidthPoints={600}
    />
  );
}

vi.mock('@floating-ui/react', async () => {
  const actual = await vi.importActual('@floating-ui/react');
  return {
    ...actual,
    autoUpdate: vi.fn().mockReturnValue(() => {}),
  };
});


// Regression test for the "RTL text box drifts on reload" bug: `left` used to be
// derived state, recomputed from a DOM pixel measurement inside the width-growth
// effect and written back via onChange({ left }) whenever `scaleFactor` settled
// from its default 1x guess to the page's real render scale — which happens on
// every fresh mount (e.g. restoring a draft). Since the drifted `left` was also
// the autosaved source of truth, every reload nudged the box further sideways.
// Position must now be pure source state: the width-growth effect may only
// report a measured `width`, never `left`.
describe('DraggableWrapper RTL text positioning', () => {
  let container: HTMLDivElement;
  let originalScrollWidth: PropertyDescriptor;
  let originalScrollHeight: PropertyDescriptor;
  let mockScrollWidth: number;
  let mockScrollHeight: number;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);

    // jsdom has no layout engine, so scrollWidth/scrollHeight are always 0.
    // Stub them so the width-growth effect has something to measure, and let
    // the test control the "measured" size to simulate typing more text.
    mockScrollWidth = 150;
    mockScrollHeight = 20;
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth');
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    if (!scrollWidthDescriptor || !scrollHeightDescriptor) {
      throw new Error('Expected Element scroll dimension descriptors');
    }
    originalScrollWidth = scrollWidthDescriptor;
    originalScrollHeight = scrollHeightDescriptor;
    Object.defineProperty(Element.prototype, 'scrollWidth', {
      configurable: true,
      get(this: Element) {
        if (this.classList?.contains('sign-text-measure') || this.classList?.contains('sign-text-input')) {
          return mockScrollWidth;
        }
        return originalScrollWidth?.get ? originalScrollWidth.get.call(this) : 0;
      }
    });
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get(this: Element) {
        if (this.classList?.contains('sign-text-measure') || this.classList?.contains('sign-text-input')) {
          return mockScrollHeight;
        }
        return originalScrollHeight?.get ? originalScrollHeight.get.call(this) : 0;
      }
    });
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    Object.defineProperty(Element.prototype, 'scrollWidth', originalScrollWidth);
    Object.defineProperty(Element.prototype, 'scrollHeight', originalScrollHeight);
  });

  function mountWithPageWrapper(element: TextElement, pageWidthPoints: number, onChange: TextChange): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = workspaceStyles['page-wrapper'];
    wrapper.getBoundingClientRect = pageRect;
    container.appendChild(wrapper);

    act(() => {
      render(
        <DraggableWrapper
          element={element}
          isActive={false}
          onBeginEdit={() => {}}
          onSelect={() => {}}
          onChange={onChange}
          onDelete={() => {}}
          onClone={() => {}}
          pageWidthPoints={pageWidthPoints}
        >
          {textNode(element)}
        </DraggableWrapper>,
        wrapper
      );
    });

    return wrapper;
  }

  it('never writes `left` from the width-growth effect as scaleFactor settles from its default 1x guess', () => {
    const element = createTextElement({
      id: 'el-1',
      left: 70,
      top: 10,
      text: 'שלום עולם',
      textDirection: 'rtl',
      fontSize: 12
    });
    const onChangeCalls: EditorElementPatch<TextElement>[] = [];

    mountWithPageWrapper(element, 612, (patch) => onChangeCalls.push(patch));

    // Mounting triggers the scaleFactor useLayoutEffect (default 1x -> real
    // used to shove `left` sideways, and later `width`. Now it should write neither.
    expect(onChangeCalls.some((patch) => 'left' in patch)).toBe(false);
    expect(onChangeCalls.some((patch) => 'width' in patch)).toBe(false);
  });

  it('keeps the RTL box anchored to a fixed right edge across reflows, independent of width', () => {
    const element = createTextElement({
      id: 'el-1',
      left: 70,
      top: 10,
      text: 'שלום עולם',
      textDirection: 'rtl',
      fontSize: 12
    });

    const wrapper = mountWithPageWrapper(element, 612, () => {});
    const box = requiredElement<HTMLDivElement>(wrapper, `.${elementStyles.element}`);

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
          onBeginEdit={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          onDelete={() => {}}
          onClone={() => {}}
          pageWidthPoints={792}
        >
          {textNode(element)}
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
          onBeginEdit={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          onDelete={() => {}}
          onClone={() => {}}
          pageWidthPoints={792}
        >
          {textNode({ ...element, text: 'שלום עולם, זה טקסט ארוך יותר' })}
        </DraggableWrapper>,
        wrapper
      );
    });

    expect(box.style.right).toBe('30%');
  });

  it('anchors LTR text boxes by their left edge, unaffected by the RTL change', () => {
    const element = createTextElement({
      id: 'el-2',
      left: 20,
      top: 10,
      text: 'Hello world',
      textDirection: 'ltr',
      fontSize: 12
    });
    const onChangeCalls: EditorElementPatch<TextElement>[] = [];

    const wrapper = mountWithPageWrapper(element, 612, (patch) => onChangeCalls.push(patch));
    const box = requiredElement<HTMLDivElement>(wrapper, `.${elementStyles.element}`);

    expect(box.style.left).toBe('20%');
    expect(box.style.right).toBe('');
    expect(onChangeCalls.some((patch) => 'left' in patch)).toBe(false);
  });

  it('owns text-box padding in shared CSS, not inline, so the two overlays cannot diverge', () => {
    const element = createTextElement({
      id: 'el-3',
      left: 20,
      top: 10,
      text: 'Hello',
      fontSize: 12
    });

    const wrapper = mountWithPageWrapper(element, 612, () => {});
    const measure = requiredElement<HTMLDivElement>(wrapper, `.${elementStyles['text-measure']}`);
    const input = requiredElement<HTMLTextAreaElement>(wrapper, `.${elementStyles['text-input']}`);

    // Padding is owned by the single `[data-editor-text-input], [data-editor-text-measure]` rule
    // in global.css, not by inline styles. Both elements carrying those classes
    // with NO inline padding is what guarantees identical box metrics — a stronger
    // guarantee than two copies of an inline value that could drift out of sync.
    expect(measure.className).toBe(elementStyles['text-measure']);
    // The input also carries the inert class when no edit session is open; what
    // matters here is that padding rides on the shared class, not inline.
    expect(input.classList.contains(elementStyles['text-input'])).toBe(true);
    expect(measure.style.padding).toBe('');
    expect(input.style.padding).toBe('');
  });

  it('sets cols=1 with the measure div in layout so short text does not leave a too-wide box', () => {
    const element = createTextElement({
      id: 'el-4',
      left: 20,
      top: 10,
      text: 'Test',
      fontSize: 12
    });

    const wrapper = mountWithPageWrapper(element, 612, () => {});
    const input = requiredElement<HTMLTextAreaElement>(wrapper, `textarea.${elementStyles['text-input']}`);
    const measure = requiredElement<HTMLDivElement>(wrapper, `.${elementStyles['text-measure']}`);

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

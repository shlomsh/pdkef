import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import DraggableWrapper from './DraggableWrapper.tsx';
import elementStyles from '../../../editor-ui/EditorElement.module.css';
import TextNode from './nodes/TextNode.tsx';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import { FillContext, TextFillContext, FILL_OFF } from '../fill/FillContext.tsx';
import type { TextFillProps } from '../fill/fillTypes.ts';
import type { EditorElementPatch, TextElement } from '../../../editor/model/editorModel.ts';

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

// MOBI-16: while typing a text box on a phone, the full formatting bar wraps
// to two or three rows and covers the fields just filled. The one element
// actually in an edit session gets a compact Previous/Next/Aa bar instead,
// gated on a coarse pointer (desktop is never affected) and on a fieldNav
// actually being supplied (a free-placed box in a document with no detected
// fields keeps today's full toolbar).
describe('DraggableWrapper compact editing toolbar (MOBI-16)', () => {
  let container: HTMLDivElement;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
    window.matchMedia = originalMatchMedia;
  });

  function setPointerCoarse(coarse: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : true,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return false; },
    })) as unknown as typeof window.matchMedia;
  }

  const fieldNav = {
    hasNext: true,
    hasPrevious: false,
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    direction: 'ltr' as const,
  };

  function mount(element: TextElement, props: { isEditing?: boolean; fieldNav?: typeof fieldNav | null } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = workspaceStyles['page-wrapper'];
    wrapper.getBoundingClientRect = pageRect;
    container.appendChild(wrapper);

    act(() => {
      render(
        <DraggableWrapper
          element={element}
          isActive
          isEditing={props.isEditing ?? true}
          onBeginEdit={() => {}}
          onSelect={() => {}}
          onChange={() => {}}
          onDelete={() => {}}
          onClone={() => {}}
          pageWidthPoints={612}
          fieldNav={'fieldNav' in props ? props.fieldNav : fieldNav}
        >
          {textNode(element)}
        </DraggableWrapper>,
        wrapper
      );
    });

    return wrapper;
  }

  function baseElement(): TextElement {
    return createTextElement({ id: 'el-1', left: 20, top: 10, text: 'Hi', fontSize: 12 });
  }

  it('collapses to Previous/Next/Aa on a coarse pointer while editing, instead of the full toolbar', () => {
    setPointerCoarse(true);
    const wrapper = mount(baseElement());

    expect(requiredElement(wrapper, 'button[aria-label="Previous field"]')).toBeTruthy();
    expect(requiredElement(wrapper, 'button[aria-label="Next field"]')).toBeTruthy();
    expect(requiredElement(wrapper, 'button[aria-label="Formatting options"]')).toBeTruthy();
    expect(wrapper.querySelector('button[title="Delete element"]')).toBeNull();
  });

  it('reveals the full toolbar on tapping Aa, and folds back on tapping it again', () => {
    setPointerCoarse(true);
    const wrapper = mount(baseElement());

    act(() => {
      requiredElement<HTMLButtonElement>(wrapper, 'button[aria-label="Formatting options"]').click();
    });

    expect(requiredElement(wrapper, 'button[title="Delete element"]')).toBeTruthy();
    expect(wrapper.querySelector('button[aria-label="Previous field"]')).toBeNull();

    act(() => {
      requiredElement<HTMLButtonElement>(wrapper, 'button[aria-label="Formatting options"]').click();
    });

    expect(requiredElement(wrapper, 'button[aria-label="Previous field"]')).toBeTruthy();
    expect(wrapper.querySelector('button[title="Delete element"]')).toBeNull();
  });

  it('never collapses on a fine pointer (desktop), even while editing with a fieldNav', () => {
    setPointerCoarse(false);
    const wrapper = mount(baseElement());

    expect(requiredElement(wrapper, 'button[title="Delete element"]')).toBeTruthy();
    expect(wrapper.querySelector('button[aria-label="Previous field"]')).toBeNull();
  });

  it('keeps the full toolbar when no fieldNav is supplied, even on a coarse pointer while editing', () => {
    setPointerCoarse(true);
    const wrapper = mount(baseElement(), { fieldNav: null });

    expect(requiredElement(wrapper, 'button[title="Delete element"]')).toBeTruthy();
    expect(wrapper.querySelector('button[aria-label="Previous field"]')).toBeNull();
  });

  it('keeps the full toolbar while merely selected (not editing), even on a coarse pointer with a fieldNav', () => {
    setPointerCoarse(true);
    const wrapper = mount(baseElement(), { isEditing: false });

    expect(requiredElement(wrapper, 'button[title="Delete element"]')).toBeTruthy();
    expect(wrapper.querySelector('button[aria-label="Previous field"]')).toBeNull();
  });

  it('disables Previous/Next per fieldNav.hasPrevious/hasNext, and wires their handlers', () => {
    setPointerCoarse(true);
    const wrapper = mount(baseElement());

    const previous = requiredElement<HTMLButtonElement>(wrapper, 'button[aria-label="Previous field"]');
    const next = requiredElement<HTMLButtonElement>(wrapper, 'button[aria-label="Next field"]');
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    act(() => next.click());
    expect(fieldNav.onNext).toHaveBeenCalledTimes(1);
  });
});

// SNG-15: fill props on a coarse pointer (docs/sign-fill-mode.md) render
// production's own element options bar and resize handles, unchanged - the
// product goal is parity with production. The only difference fill mode
// makes is that a tap on the textarea is native focus (no MOBI-21
// synchronous-focus dance), covered by the DraggableWrapper unit tests
// above. `fieldNav` (and so `.quick-field-nav`) stays off in fill mode,
// but that is PdfWorkspace.tsx's own gate (it never supplies `fieldNav`
// while `fill.enabled`), not something this component decides.
describe('DraggableWrapper fill mode (SNG-15)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  const fill: TextFillProps = { fillKey: 'el:1', enterKeyHint: 'next', onEnter: vi.fn() };

  function mountFillCase(coarse: boolean) {
    const wrapper = document.createElement('div');
    wrapper.className = workspaceStyles['page-wrapper'];
    wrapper.getBoundingClientRect = pageRect;
    container.appendChild(wrapper);

    const element = createTextElement({ id: 'el-1', left: 20, top: 10, text: 'Hi', fontSize: 12 });

    act(() => {
      render(
        <FillContext.Provider value={{ ...FILL_OFF, enabled: true, coarse }}>
          <TextFillContext.Provider value={fill}>
            <DraggableWrapper
              element={element}
              isActive
              onBeginEdit={() => {}}
              onSelect={() => {}}
              onChange={() => {}}
              onDelete={() => {}}
              onClone={() => {}}
              pageWidthPoints={612}
            >
              {textNode(element)}
            </DraggableWrapper>
          </TextFillContext.Provider>
        </FillContext.Provider>,
        wrapper,
      );
    });

    return wrapper;
  }

  it('renders the element options bar and resize handles on a coarse pointer, with no quick-field-nav', () => {
    const wrapper = mountFillCase(true);

    expect(wrapper.querySelector('[data-editor-actions]')).not.toBeNull();
    expect(wrapper.querySelector('[data-editor-resizer]')).not.toBeNull();
    expect(wrapper.querySelector(`.${elementStyles['quick-field-nav']}`)).toBeNull();
  });

  it('keeps the resize handles and the floating toolbar on a fine pointer', () => {
    const wrapper = mountFillCase(false);

    expect(wrapper.querySelector('[data-editor-actions]')).not.toBeNull();
    expect(wrapper.querySelector('[data-editor-resizer]')).not.toBeNull();
  });

  it('SNG-17: collapses to Aa alone (no Previous/Next) in fill mode while editing on a coarse pointer', () => {
    const wrapper = document.createElement('div');
    wrapper.className = workspaceStyles['page-wrapper'];
    wrapper.getBoundingClientRect = pageRect;
    container.appendChild(wrapper);
    const element = createTextElement({ id: 'el-1', left: 20, top: 10, text: 'Hi', fontSize: 12 });

    act(() => {
      render(
        <FillContext.Provider value={{ ...FILL_OFF, enabled: true, coarse: true }}>
          <TextFillContext.Provider value={fill}>
            <DraggableWrapper
              element={element}
              isActive
              isEditing
              onBeginEdit={() => {}}
              onSelect={() => {}}
              onChange={() => {}}
              onDelete={() => {}}
              onClone={() => {}}
              pageWidthPoints={612}
            >
              {textNode(element)}
            </DraggableWrapper>
          </TextFillContext.Provider>
        </FillContext.Provider>,
        wrapper,
      );
    });

    expect(requiredElement(wrapper, 'button[aria-label="Formatting options"]')).toBeTruthy();
    expect(wrapper.querySelector('button[aria-label="Previous field"]')).toBeNull();
    expect(wrapper.querySelector('button[aria-label="Next field"]')).toBeNull();
    expect(wrapper.querySelector(`.${elementStyles['quick-field-nav']}`)).toBeNull();
    expect(wrapper.querySelector('button[title="Delete element"]')).toBeNull();
  });

  it('renders production chrome as today when fill props are absent, even on a coarse pointer', () => {
    const wrapper = document.createElement('div');
    wrapper.className = workspaceStyles['page-wrapper'];
    wrapper.getBoundingClientRect = pageRect;
    container.appendChild(wrapper);
    const element = createTextElement({ id: 'el-1', left: 20, top: 10, text: 'Hi', fontSize: 12 });

    act(() => {
      render(
        <FillContext.Provider value={{ ...FILL_OFF, enabled: true, coarse: true }}>
          <DraggableWrapper
            element={element}
            isActive
            onBeginEdit={() => {}}
            onSelect={() => {}}
            onChange={() => {}}
            onDelete={() => {}}
            onClone={() => {}}
            pageWidthPoints={612}
          >
            {textNode(element)}
          </DraggableWrapper>
        </FillContext.Provider>,
        wrapper,
      );
    });

    expect(wrapper.querySelector('[data-editor-actions]')).not.toBeNull();
    expect(wrapper.querySelector('[data-editor-resizer]')).not.toBeNull();
  });
});

// SNG-04 (docs/sign-next-gen-guidelines.md §2.2): fill mode only. A finger
// meant to scroll over an already-placed, unselected element must not drag
// it; a one-finger swipe there is native panning instead. Wired through
// DraggableWrapper's own `touchNeedsSelection: fillContext.enabled` and
// `isSelected: isActive` - the pure decision itself is
// `touchClaimsElement` (src/editor/gestures/touchClaim.test.ts).
describe('DraggableWrapper touch-vs-scroll in fill mode (SNG-04)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => render(null, container));
    container.remove();
  });

  function touchPoint(clientX: number, clientY: number) {
    return { clientX, clientY } as Touch;
  }

  function dispatchTouchStart(target: EventTarget, touches: Touch[]) {
    let event: TouchEvent | null = null;
    act(() => {
      event = new TouchEvent('touchstart', { touches, changedTouches: touches, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
    });
    return event as unknown as TouchEvent;
  }

  function dispatchTouchMove(touches: Touch[]) {
    act(() => {
      window.dispatchEvent(
        new TouchEvent('touchmove', { touches, changedTouches: touches, bubbles: true, cancelable: true })
      );
    });
  }

  function dispatchTouchEnd(lastTouch: Touch) {
    act(() => {
      window.dispatchEvent(
        new TouchEvent('touchend', { touches: [], changedTouches: [lastTouch], bubbles: true, cancelable: true })
      );
    });
  }

  function mountFillMode({
    isActive,
    onSelect = vi.fn(),
    onChange = vi.fn(),
  }: {
    isActive: boolean;
    onSelect?: (e: Event) => void;
    onChange?: TextChange;
  }) {
    const wrapper = document.createElement('div');
    wrapper.className = workspaceStyles['page-wrapper'];
    wrapper.getBoundingClientRect = pageRect;
    container.appendChild(wrapper);

    const element = createTextElement({ id: 'el-1', left: 20, top: 10, text: 'Hi', fontSize: 12 });

    act(() => {
      render(
        <FillContext.Provider value={{ ...FILL_OFF, enabled: true, coarse: true }}>
          <DraggableWrapper
            element={element}
            isActive={isActive}
            onBeginEdit={() => {}}
            onSelect={onSelect}
            onChange={onChange}
            onDelete={() => {}}
            onClone={() => {}}
            pageWidthPoints={612}
          >
            {textNode(element)}
          </DraggableWrapper>
        </FillContext.Provider>,
        wrapper,
      );
    });

    const box = requiredElement<HTMLDivElement>(wrapper, `.${elementStyles.element}`);
    // The dragged node measures itself via getBoundingClientRect at pointer-down.
    box.getBoundingClientRect = () => new DOMRect(140, 90, 80, 20);
    return { wrapper, box };
  }

  it('does not select or drag an unselected element on a touchmove past 8px, in fill mode', () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    const { box } = mountFillMode({ isActive: false, onSelect, onChange });

    const startEvent = dispatchTouchStart(box, [touchPoint(300, 400)]);
    dispatchTouchMove([touchPoint(320, 400)]);
    dispatchTouchEnd(touchPoint(320, 400));

    expect(startEvent.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('carries `data-touch-scroll` on an unselected element in fill mode', () => {
    const { box } = mountFillMode({ isActive: false });

    expect(box.hasAttribute('data-touch-scroll')).toBe(true);
  });

  it('drops `data-touch-scroll` once the element is active/selected', () => {
    const { box } = mountFillMode({ isActive: true });

    expect(box.hasAttribute('data-touch-scroll')).toBe(false);
  });

  it('still drags an already-selected (active) element in fill mode', () => {
    const onChange = vi.fn();
    const { box } = mountFillMode({ isActive: true, onChange });

    dispatchTouchStart(box, [touchPoint(300, 400)]);
    dispatchTouchMove([touchPoint(320, 400)]);
    dispatchTouchEnd(touchPoint(320, 400));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

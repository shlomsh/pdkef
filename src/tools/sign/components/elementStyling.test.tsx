// The editor element styling contracts: the classes that carry shared padding, inert or fill
// appearance, and display metrics. Every other Sign test finds these elements by data attribute;
// this is the one place that asserts the CSS Module classes themselves, because the class is the
// thing under test (a rule in EditorElement.module.css or fill.module.css keys off it).
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import DraggableWrapper from './DraggableWrapper.tsx';
import TextNode from './nodes/TextNode.tsx';
import FieldSlot from './fill/FieldSlot.tsx';
import { TextFillContext } from './fill/FillContext.tsx';
import elementStyles from '#editor-ui/EditorElement.module.css';
import styles from './fill/fill.module.css';
import type { FillSlot, TextFillProps } from '../lib/fill/fillTypes.ts';
import type { TextElement } from '#editor/model/editorModel.ts';

vi.mock('@floating-ui/react', async () => {
  const actual = await vi.importActual('@floating-ui/react');
  return { ...actual, autoUpdate: vi.fn().mockReturnValue(() => {}) };
});

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to be rendered`);
  return element;
}

// A host tagged as the real page wrapper, with a realistic rect (jsdom's default is 0x0).
function mount(vnode: ComponentChildren): HTMLDivElement {
  const host = document.createElement('div');
  host.setAttribute('data-page-wrapper', '');
  host.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

function textElement(overrides: Partial<TextElement> = {}): TextElement {
  return { id: 'text-1', type: 'text', pageIndex: 0, left: 0, top: 0, text: 'Hello', fontSize: 12, ...overrides };
}

function textNode(props: { element: TextElement; isActive?: boolean; isEditing?: boolean; onSelect?: (e: Event) => void }) {
  return (
    <TextNode
      isActive={false}
      isEditing={false}
      onChange={() => {}}
      onSelect={() => {}}
      onBeginEdit={() => {}}
      onResizeStart={() => {}}
      pageWidthPoints={600}
      {...props}
    />
  );
}

function fillProps(overrides: Partial<TextFillProps> = {}): TextFillProps {
  return { fillKey: 'el:text-1', enterKeyHint: 'next', onEnter: vi.fn(), ...overrides };
}

function fillSlot(): FillSlot {
  return {
    key: 'slot:0:12.50:30.00',
    pageIndex: 0,
    field: null,
    placement: { box: { left: 12.5, top: 30, width: 40, height: 6 }, fontSize: 12, fontFamily: 'Arimo' },
  };
}

function slotTextElementOf(text: string, overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: 'fill-slot-preview', type: 'text', pageIndex: 0, left: 12.5, top: 30,
    fontFamily: 'Arimo', fontSize: 12, text, color: '#1463ff', ...overrides,
  };
}

function fieldSlot(aimed: boolean, elementOf: (text: string) => TextElement = slotTextElementOf) {
  return (
    <FieldSlot
      slot={fillSlot()}
      enterKeyHint="next"
      aimed={aimed}
      pageWidthPoints={600}
      label="First name"
      elementOf={elementOf}
      onEnter={() => {}}
      onCommit={() => {}}
    />
  );
}

describe('editor element styling contracts', () => {
  let host = document.createElement('div');

  afterEach(() => {
    if (host.isConnected) {
      act(() => render(null, host));
      host.remove();
    }
  });

  it('text box padding rides on the shared measure and input classes, not inline', () => {
    const element = textElement({ id: 'el-3', left: 20, top: 10 });
    host = mount(
      <DraggableWrapper
        element={element}
        isActive={false}
        onBeginEdit={() => {}}
        onSelect={() => {}}
        onChange={() => {}}
        onDelete={() => {}}
        onClone={() => {}}
        pageWidthPoints={612}
      >
        {textNode({ element })}
      </DraggableWrapper>,
    );
    const measure = requireElement<HTMLDivElement>(host, '[data-editor-text-measure]');
    const input = requireElement<HTMLTextAreaElement>(host, '[data-editor-text-input]');

    expect(measure.className).toBe(elementStyles['text-measure']);
    expect(input.classList.contains(elementStyles['text-input'])).toBe(true);
  });

  it('a TextNode with no edit session open is inert', () => {
    host = mount(textNode({ element: textElement(), isActive: true }));
    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    expect(textarea.classList.contains(elementStyles['text-input-inert'])).toBe(true);
  });

  it('a TextNode in fill mode carries the fill class, not the inert one', () => {
    host = mount(<TextFillContext.Provider value={fillProps()}>{textNode({ element: textElement() })}</TextFillContext.Provider>);
    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    expect(textarea.classList.contains(elementStyles['text-input-inert'])).toBe(false);
    expect(textarea.classList.contains(elementStyles['text-input-fill'])).toBe(true);
  });

  it('a TextNode with no fill provider stays inert', () => {
    host = mount(<TextFillContext.Provider value={null}>{textNode({ element: textElement() })}</TextFillContext.Provider>);
    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    expect(textarea.classList.contains(elementStyles['text-input-inert'])).toBe(true);
  });

  it('a FieldSlot input carries the slot class whether aimed or at rest', () => {
    for (const aimed of [true, false]) {
      host = mount(fieldSlot(aimed));
      const input = requireElement<HTMLInputElement>(host, 'input');
      expect(input.classList.contains(styles.slot)).toBe(true);
      act(() => render(null, host));
      host.remove();
    }
  });

  it('a comb slot overlay draws its cells in the element display shell', () => {
    const combElementOf = (text: string) => slotTextElementOf(text, { left: 4.82, top: 30.2, width: 13.3, combCells: 7, fontSize: 10 });
    host = mount(fieldSlot(false, combElementOf));
    const input = requireElement<HTMLInputElement>(host, 'input');
    act(() => {
      input.value = '3785500';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const overlay = requireElement<HTMLDivElement>(host, '[data-comb-overlay]');
    const shell = overlay.firstElementChild as HTMLElement;
    expect(shell.classList.contains(elementStyles['text-display'])).toBe(true);
  });
});

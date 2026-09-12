import { render, type ComponentChildren, type ComponentProps } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import RawTextNode from './TextNode.tsx';
import workspaceStyles from '../Workspace.module.css';
import elementStyles from '../EditorElement.module.css';
import { WYSIWYG_STRING_CASES } from '../../../test/fixtures/wysiwygStrings.js';
import type { EditorElementPatch, TextElement } from '../../../editor/model/editorModel.ts';
import type { ElementNodeChange, NodeResizeStart } from '../nodeProps.ts';

const onChange: ElementNodeChange<TextElement> = () => {};
const onSelect = (_event: Event) => {};
const onBeginEdit = () => {};
const onResizeStart: NodeResizeStart = () => {};

type TextFixture = EditorElementPatch<TextElement> & { type?: 'text' };
type TextNodeTestProps = { element: TextFixture } & Partial<Omit<ComponentProps<typeof RawTextNode>, 'element'>>;
interface WysiwygStringCase {
  id: string;
  text: string;
  direction: 'ltr' | 'rtl';
  family: string;
  support: 'compatible' | 'fallback' | 'incompatible';
}

const wysiwygStringCases = WYSIWYG_STRING_CASES as readonly WysiwygStringCase[];

function textElement(overrides: TextFixture): TextElement {
  return { id: 'text-1', type: 'text', pageIndex: 0, left: 0, top: 0, text: '', ...overrides };
}

function TextNode({ element, ...props }: TextNodeTestProps) {
  return <RawTextNode
    element={textElement(element)}
    isActive={false}
    isEditing={false}
    onChange={onChange}
    onSelect={onSelect}
    onBeginEdit={onBeginEdit}
    onResizeStart={onResizeStart}
    pageWidthPoints={600}
    {...props}
  />;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to be rendered`);
  return element;
}

function mount(vnode: ComponentChildren): HTMLDivElement {
  const host = document.createElement('div');
  host.className = workspaceStyles['page-wrapper'];
  host.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

describe('TextNode component', () => {
  let host = document.createElement('div');

  afterEach(() => {
    if (host.isConnected) {
      act(() => render(null, host));
      document.body.removeChild(host);
    }
  });

  it('renders correctly with given text, color, and default font details', () => {
    const element: TextFixture = {
      text: 'Hello Preact',
      color: '#ff0000',
      fontSize: 16,
      fontFamily: 'Arimo',
      fontWeight: 'bold',
      fontStyle: 'italic'
    };

    host = mount(
      <TextNode
        element={element}
        isActive={true}
        onChange={() => {}}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('Hello Preact');
    
    // Check that styles are applied. JSDOM parses hex/color styles into standard properties
    expect(textarea.style.color).toBe('rgb(255, 0, 0)');
    expect(textarea.style.fontSize).toBe('16px'); // scale is 1
    expect(textarea.style.fontFamily).toBe('Arimo');
    expect(textarea.style.fontWeight).toBe('bold');
    expect(textarea.style.fontStyle).toBe('italic');
  });

  it('triggers onChange when typing in textarea', () => {
    const element: TextFixture = { text: 'Initial text', fontSize: 12 };
    const onChange = vi.fn();

    host = mount(
      <TextNode
        element={element}
        isActive={true}
        onChange={onChange}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    act(() => {
      textarea.value = 'User typed this';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ text: 'User typed this' });
  });

  it('quietly chooses a compatible font when a fresh field receives Hebrew', () => {
    // A new field can inherit the last-used family, but it is still not an
    // explicit choice for this text. Sacramento makes the substitution visible
    // in the patch, unlike the default Arimo which already covers Hebrew.
    const element: TextFixture = { type: 'text', text: '', fontFamily: 'Sacramento', fontFamilyExplicit: false, fontSize: 12 };
    const onChange = vi.fn();
    host = mount(
      <TextNode
        element={element}
        isActive={true}
        isEditing={true}
        onChange={onChange}
        onSelect={() => {}}
        onBeginEdit={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />,
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    act(() => {
      textarea.value = 'שלומי';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith({ text: 'שלומי', fontFamily: 'Gveret Levin' });
  });

  it('keeps an explicitly chosen incompatible font so its fallback remains explainable', () => {
    const element: TextFixture = { type: 'text', text: '', fontFamily: 'Sacramento', fontFamilyExplicit: true, fontSize: 12 };
    const onChange = vi.fn();
    host = mount(
      <TextNode
        element={element}
        isActive={true}
        isEditing={true}
        onChange={onChange}
        onSelect={() => {}}
        onBeginEdit={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />,
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    act(() => {
      textarea.value = 'שלומי';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith({ text: 'שלומי' });
  });

  it('derives direction from typed text across neutral, RTL, and digit-only transitions', () => {
    const renderNode = (text: string): HTMLTextAreaElement => {
      act(() => {
        render(
          <TextNode
            element={{ text, textDirection: 'rtl', fontSize: 12 }}
            isActive={true}
            isEditing={true}
            onChange={() => {}}
            onSelect={() => {}}
            onResizeStart={() => {}}
            pageWidthPoints={600}
          />,
          host
        );
      });
      return requireElement<HTMLTextAreaElement>(host, 'textarea');
    };

    host = mount(<div />);
    expect(renderNode('').dir).toBe('ltr');
    expect(renderNode('مرحبا').dir).toBe('rtl');
    expect(renderNode('27/05/2008').dir).toBe('ltr');
  });

  it.each(wysiwygStringCases.map(({ id, text, direction, family, support }) => [id, text, direction, family, support] as const))(
    '%s: renders the supplied string with editor/export direction and font agreement',
    (_id, text, direction, family, support) => {
      host = mount(
        <TextNode
          element={{ type: 'text', text, fontFamily: 'Arimo', fontSize: 16 }}
          isActive={false}
          isEditing={false}
          onChange={() => {}}
          onSelect={() => {}}
          onBeginEdit={() => {}}
          onResizeStart={() => {}}
          pageWidthPoints={600}
        />,
      );

      const input = requireElement<HTMLTextAreaElement>(host, '[data-editor-text-input]');
      const measure = requireElement<HTMLDivElement>(host, '[data-editor-text-measure]');
      expect(input.value).toBe(text);
      expect(input.dir).toBe(direction);
      expect(measure.dir).toBe(direction);
      expect(input.style.fontFamily.replace(/"/g, '')).toBe(family);
      expect(measure.style.fontFamily.replace(/"/g, '')).toBe(family);
      expect(input.getAttribute('aria-invalid')).toBe(support === 'incompatible' ? 'true' : null);
    },
  );

  it('triggers onSelect when textarea receives focus', () => {
    const element: TextFixture = { text: 'Focus test', fontSize: 12 };
    const onSelect = vi.fn();

    host = mount(
      <TextNode
        element={element}
        isActive={false}
        onChange={() => {}}
        onSelect={onSelect}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    act(() => {
      textarea.focus();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('takes the caret when an edit session is open, with the cursor at the end', () => {
    const element: TextFixture = { text: 'Hello', fontSize: 12 };
    host = mount(
      <TextNode
        element={element}
        isActive={true}
        isEditing={true}
        onChange={vi.fn()}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);
    expect(textarea.readOnly).toBe(false);
  });

  it('updates local feedback immediately as text is corrected, without replacing the input or losing its caret', () => {
    const element: TextFixture = { type: 'text', fontFamily: 'Assistant', text: 'שלום Hello مرحبا', fontSize: 12 };
    const show = (changes: TextFixture = {}, active = true) => <TextNode
      element={{ ...element, ...changes }} isActive={active} isEditing={active}
      onChange={() => {}} onSelect={() => {}} onBeginEdit={() => {}}
      onResizeStart={() => {}} pageWidthPoints={600}
    />;
    host = mount(show());
    const input = requireElement<HTMLTextAreaElement>(host, 'textarea');
    const notice = requireElement<HTMLElement>(host, '[data-editor-font-notice]');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(notice.textContent).toContain('separate text boxes');
    expect(notice.textContent).toContain('Assistant');
    expect(notice.textContent).toContain('Vazirmatn');
    expect(document.activeElement).toBe(input);
    // The browser applies an edit before the parent's controlled render.
    input.value = 'שלום Hello';
    input.setSelectionRange(3, 3);

    act(() => render(show({ text: 'שלום Hello' }), host));
    expect(host.querySelector('textarea')).toBe(input);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(host.querySelector('[data-editor-font-notice]')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(3);

    act(() => render(show({ text: 'Hello مرحبا' }), host));
    expect(input.style.fontFamily).toContain('Vazirmatn');
    expect(requireElement<HTMLElement>(host, '[data-editor-font-notice]').textContent)
      .toBe('A fallback font is in use for this text. Choose another font in the font menu.');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('keeps an actionable marker on an unselected incompatible box', () => {
    const onBeginEdit = vi.fn();
    host = mount(<TextNode
      element={{ text: 'שלום مرحبا', fontFamily: 'Arimo' }} isActive={false} isEditing={false}
      onChange={() => {}} onSelect={() => {}} onBeginEdit={onBeginEdit}
      onResizeStart={() => {}} pageWidthPoints={600}
    />);
    const notice = requireElement<HTMLElement>(host, '[data-editor-font-notice]');
    const button = requireElement<HTMLButtonElement>(notice, 'button');
    expect(button.textContent).toBe('');
    expect(button.getAttribute('aria-label')).toContain('Select for font suggestions');
    expect(notice.getAttribute('data-editor-font-marker-side')).toBe('left');
    act(() => button.click());
    expect(onBeginEdit).toHaveBeenCalledOnce();
  });

  it('puts the inactive marker at the bottom end for both text directions', () => {
    const show = (element: TextFixture) => <TextNode
      element={element} isActive={false} isEditing={false}
      onChange={() => {}} onSelect={() => {}} onBeginEdit={() => {}}
      onResizeStart={() => {}} pageWidthPoints={600}
    />;
    host = mount(show({ text: 'Hello 😀', fontFamily: 'Arimo' }));
    expect(requireElement<HTMLElement>(host, '[data-editor-font-marker-side]').getAttribute('data-editor-font-marker-side')).toBe('right');

    act(() => render(show({ text: 'שלום مرحبا', fontFamily: 'Arimo' }), host));
    expect(requireElement<HTMLElement>(host, '[data-editor-font-marker-side]').getAttribute('data-editor-font-marker-side')).toBe('left');
  });

  it('stays inert while selected but not editing, so the click selects instead of typing', () => {
    const element: TextFixture = { text: 'Hello', fontSize: 12 };
    host = mount(
      <TextNode
        element={element}
        isActive={true}
        isEditing={false}
        onChange={vi.fn()}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');
    expect(document.activeElement).not.toBe(textarea);
    expect(textarea.readOnly).toBe(true);
    expect(textarea.getAttribute('tabindex')).toBe('-1');
    expect(textarea.classList.contains(elementStyles['text-input-inert'])).toBe(true);
  });

  it('opens an edit session on double click', () => {
    const onBeginEdit = vi.fn();
    host = mount(
      <TextNode
        element={{ text: 'Hello', fontSize: 12 }}
        isActive={true}
        isEditing={false}
        onChange={vi.fn()}
        onSelect={() => {}}
        onBeginEdit={onBeginEdit}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    act(() => {
      requireElement<HTMLElement>(host, '[data-editor-text-display]')
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(onBeginEdit).toHaveBeenCalledTimes(1);
  });

  it('focuses textarea when style properties change while a toolbar element is focused', () => {
    const element: TextFixture = { text: 'Style focus', fontSize: 12, color: '#000000' };
    const onChange = vi.fn();

    host = mount(
      <TextNode
        element={element}
        isActive={true}
        isEditing={true}
        onChange={onChange}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    const textarea = requireElement<HTMLTextAreaElement>(host, 'textarea');

    // Create a mock toolbar element and focus it
    const toolbar = document.createElement('div');
    toolbar.className = elementStyles.actions;
    const button = document.createElement('button');
    toolbar.appendChild(button);
    host.appendChild(toolbar);
    button.focus();
    expect(document.activeElement).toBe(button);
    
    // Now trigger a re-render with a different style (color change)
    act(() => {
      render(
        <TextNode
          element={{ ...element, color: '#ff0000' }}
          isActive={true}
          isEditing={true}
          onChange={onChange}
          onSelect={() => {}}
          onResizeStart={() => {}}
          pageWidthPoints={600}
        />,
        host
      );
    });
    
    // Verify it automatically refocused due to the style change
    expect(document.activeElement).toBe(textarea);
    
    // Clean up
    host.removeChild(toolbar);
  });

  // The editor must render the family the exporter will embed. If it renders
  // the picked family instead, the browser silently patches in a system font
  // for the missing glyphs and the screen stops matching the downloaded PDF.
  it('renders Hebrew in the substituted font when the picked font has no Hebrew glyphs', () => {
    host = mount(
      <TextNode
        element={{ text: '\u05e9\u05dc\u05d5\u05de\u05d9', fontFamily: 'Caveat', fontSize: 16 }}
        isActive={false}
        onChange={() => {}}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    // jsdom serializes a multi-word family with quotes, hence the strip.
    const unquote = (node: HTMLElement) => node.style.fontFamily.replace(/"/g, '');
    expect(unquote(requireElement<HTMLTextAreaElement>(host, '[data-editor-text-input]'))).toBe('Gveret Levin');
    expect(unquote(requireElement<HTMLDivElement>(host, '[data-editor-text-measure]'))).toBe('Gveret Levin');
  });

  it('keeps the picked font for Latin text in that same font', () => {
    host = mount(
      <TextNode
        element={{ text: 'Shlomi', fontFamily: 'Caveat', fontSize: 16 }}
        isActive={false}
        onChange={() => {}}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    expect(requireElement<HTMLTextAreaElement>(host, '[data-editor-text-input]').style.fontFamily).toBe('Caveat');
  });

  describe('comb layout', () => {
    const renderComb = (element: TextFixture, isActive = true) => mount(
      <TextNode
        element={{ type: 'text', fontSize: 16, width: 40, ...element }}
        isActive={isActive}
        onChange={() => {}}
        onSelect={() => {}}
        onResizeStart={() => {}}
        pageWidthPoints={600}
      />
    );

    it('places one character per cell at the cell centre', () => {
      host = renderComb({ text: '270' });
      const cells = [...host.querySelectorAll<HTMLElement>(`.${elementStyles['text-comb-cell']}`)];
      expect(cells.map((cell) => cell.textContent)).toEqual(['2', '7', '0']);
      // Centres, not edges: 1/6, 3/6, 5/6 of the span.
      expect(cells.map((cell) => cell.style.left)).toEqual([
        `${(1 / 6) * 100}%`, '50%', `${(5 / 6) * 100}%`,
      ]);
    });

    it('shows the alignment guides only while selected, so they stay an editing aid', () => {
      host = renderComb({ text: '270' });
      expect(host.querySelectorAll(`.${elementStyles['text-comb-guide']}`)).toHaveLength(2);
      document.body.removeChild(host);

      host = renderComb({ text: '270' }, false);
      expect(host.querySelectorAll(`.${elementStyles['text-comb-guide']}`)).toHaveLength(0);
    });

    it('renders blank cells for a field with boxes left empty', () => {
      host = renderComb({ text: '27', combCells: 5 });
      expect([...host.querySelectorAll(`.${elementStyles['text-comb-cell']}`)].map((c) => c.textContent))
        .toEqual(['2', '7', '', '', '']);
    });

    it('hides the textarea’s own text but keeps its caret, since the cells are what you see', () => {
      host = renderComb({ text: '270', color: '#112233' });
      const input = requireElement<HTMLTextAreaElement>(host, '[data-editor-text-input]');
      expect(input.style.color).toBe('transparent');
      expect(input.style.caretColor).toBe('rgb(17, 34, 51)');
    });

    it('mirrors cell position for RTL content, so the first character typed lands nearest the right edge', () => {
      // Hebrew has a strong RTL character, so direction auto-detects without
      // needing textDirection set (see signHelpers.js).
      host = renderComb({ text: 'שלום' });
      const cells = [...host.querySelectorAll<HTMLElement>(`.${elementStyles['text-comb-cell']}`)];
      // Array order (and so which character is "first") is unchanged - only
      // *where* each index renders mirrors. LTR would be 1/8, 3/8, 5/8, 7/8;
      // RTL is that reversed, so the first character ('ש') ends up at 7/8
      // (nearest the right edge), not 1/8.
      expect(cells.map((cell) => cell.textContent)).toEqual(['ש', 'ל', 'ו', 'ם']);
      expect(cells.map((cell) => cell.style.left)).toEqual([
        `${(7 / 8) * 100}%`, `${(5 / 8) * 100}%`, `${(3 / 8) * 100}%`, `${(1 / 8) * 100}%`,
      ]);
    });

    it('leaves a plain text box completely alone', () => {
      host = mount(
        <TextNode
          element={{ type: 'text', text: '270', fontSize: 16 }}
          isActive
          onChange={() => {}}
          onSelect={() => {}}
          onResizeStart={() => {}}
          pageWidthPoints={600}
        />
      );
      expect(host.querySelector(`.${elementStyles['text-comb']}`)).toBeNull();
      expect(requireElement<HTMLTextAreaElement>(host, '[data-editor-text-input]').style.color).toBe('rgb(0, 0, 0)');
    });
  });
});

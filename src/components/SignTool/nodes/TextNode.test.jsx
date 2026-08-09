import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TextNode from './TextNode.jsx';
import workspaceStyles from '../Workspace.module.css';
import elementStyles from '../EditorElement.module.css';

function mount(vnode) {
  const host = document.createElement('div');
  host.className = workspaceStyles['page-wrapper'];
  host.getBoundingClientRect = () => ({ width: 600, height: 800, top: 0, left: 0, right: 600, bottom: 800 });
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

describe('TextNode component', () => {
  let host;

  afterEach(() => {
    if (host) {
      document.body.removeChild(host);
      host = null;
    }
  });

  it('renders correctly with given text, color, and default font details', () => {
    const element = {
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

    const textarea = host.querySelector('textarea');
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
    const element = { text: 'Initial text', fontSize: 12 };
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

    const textarea = host.querySelector('textarea');
    act(() => {
      textarea.value = 'User typed this';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ text: 'User typed this' });
  });

  it('triggers onSelect when textarea receives focus', () => {
    const element = { text: 'Focus test', fontSize: 12 };
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

    const textarea = host.querySelector('textarea');
    act(() => {
      textarea.dispatchEvent(new Event('focus', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('takes the caret when an edit session is open, with the cursor at the end', () => {
    const element = { text: 'Hello', fontSize: 12 };
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

    const textarea = host.querySelector('textarea');
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);
    expect(textarea.readOnly).toBe(false);
  });

  it('stays inert while selected but not editing, so the click selects instead of typing', () => {
    const element = { text: 'Hello', fontSize: 12 };
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

    const textarea = host.querySelector('textarea');
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
      host.querySelector('[data-editor-text-display]')
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(onBeginEdit).toHaveBeenCalledTimes(1);
  });

  it('focuses textarea when style properties change while a toolbar element is focused', () => {
    const element = { text: 'Style focus', fontSize: 12, color: '#000000' };
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

    const textarea = host.querySelector('textarea');

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
    const unquote = (node) => node.style.fontFamily.replace(/"/g, '');
    expect(unquote(host.querySelector('[data-editor-text-input]'))).toBe('Gveret Levin');
    expect(unquote(host.querySelector('[data-editor-text-measure]'))).toBe('Gveret Levin');
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

    expect(host.querySelector('[data-editor-text-input]').style.fontFamily).toBe('Caveat');
  });
});

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TextNode from './TextNode.jsx';

function mount(vnode) {
  const host = document.createElement('div');
  host.className = 'sign-page-wrapper';
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
        isActive={true}
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

  it('focuses textarea automatically when isActive is true', () => {
    const element = { text: 'Hello', fontSize: 12 };
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
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(5);
  });

  it('focuses textarea when style properties change while isActive is true', () => {
    const element = { text: 'Style focus', fontSize: 12, color: '#000000' };
    
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
    expect(document.activeElement).toBe(textarea);
    
    // Blur manually to simulate losing focus
    textarea.blur();
    expect(document.activeElement).not.toBe(textarea);
    
    // Now trigger a re-render with a different style (color change)
    act(() => {
      render(
        <TextNode
          element={{ ...element, color: '#ff0000' }}
          isActive={true}
          onChange={() => {}}
          onSelect={() => {}}
          onResizeStart={() => {}}
          pageWidthPoints={600}
        />,
        host
      );
    });
    
    // Verify it automatically refocused due to the style change
    expect(document.activeElement).toBe(textarea);
  });
});

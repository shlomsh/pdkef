import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi } from 'vitest';
import ShapeNode from './SignTool/nodes/ShapeNode.jsx';
import LineNode from './SignTool/nodes/LineNode.jsx';
import DraggableWrapper from './SignTool/DraggableWrapper.jsx';
import WhiteoutNode from './SignTool/nodes/WhiteoutNode.jsx';

function mount(vnode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

// Regression guard for the raw-Preact SVG attribute class of bug: camelCase
// presentation attributes (strokeWidth, vectorEffect...) are NOT converted to
// kebab-case by Preact, so they render as invalid attributes the browser ignores
// and the stroke silently falls back to 1px. This is exactly what made the Sign
// tool's thickness picker do nothing. Assert the real kebab-case attributes land.
describe('SVG stroke attributes render as kebab-case', () => {
  it('ShapeElement ellipse carries stroke-width + vector-effect', () => {
    const host = mount(<ShapeNode element={{ type: 'ellipse', strokeWidth: 16, color: '#000' }} />);
    const el = host.querySelector('ellipse');
    expect(el.getAttribute('stroke-width')).toBe('16');
    expect(el.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    // The invalid camelCase form must not be what's emitted.
    expect(el.getAttribute('strokeWidth')).toBeNull();
  });

  it('ShapeElement rectangle carries stroke-width', () => {
    const host = mount(<ShapeNode element={{ type: 'rectangle', strokeWidth: 8, color: '#000' }} />);
    expect(host.querySelector('rect').getAttribute('stroke-width')).toBe('8');
  });

  it('LineElement renders a visible stroke and a fat invisible hit-area', () => {
    const host = mount(
      <LineNode element={{ x1: 10, y1: 10, x2: 80, y2: 80, strokeWidth: 12, color: '#000' }} handlePointerDown={() => {}} />
    );
    const lines = host.querySelectorAll('line');
    // Visible line reflects the chosen thickness...
    expect(lines[0].getAttribute('stroke-width')).toBe('12');
    // ...and the second line is the wide, transparent grab target (was silently
    // 1px when written as camelCase, making lines hard to select/drag).
    expect(lines[1].getAttribute('stroke-width')).toBe('20');
  });
});

// Regression guard for the drag crash: DraggableOverlayElement used isDragging /
// dragOffset refs that were never declared, so a per-element ReferenceError threw
// on mount and broke dragging for every element type. Mounting it (its effect
// reads isDragging.current) and running a full drag exercises that path.
describe('DraggableWrapper dragging', () => {
  function renderInPage(element, onChange) {
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
          {element.type === 'whiteout' && <WhiteoutNode element={element} />}
          {(element.type === 'ellipse' || element.type === 'rectangle') && <ShapeNode element={element} />}
          {element.type === 'line' && <LineNode element={element} />}
        </DraggableWrapper>,
        page
      );
    });
    return page;
  }

  it('mounts without throwing for a line element', () => {
    expect(() => renderInPage({ type: 'line', x1: 10, y1: 10, x2: 40, y2: 40, strokeWidth: 3 }, () => {})).not.toThrow();
  });

  it('commits a box-element move to onChange on mouseup', () => {
    const onChange = vi.fn();
    const page = renderInPage(
      { type: 'rectangle', left: 20, top: 20, width: 10, height: 10, strokeWidth: 3 },
      onChange
    );
    const el = page.querySelector('.sign-element');

    act(() => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 140, clientY: 130 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalled();
    const committed = onChange.mock.calls.at(-1)[0];
    expect(committed).toHaveProperty('left');
    expect(committed).toHaveProperty('top');
  });

  it('whiteout mounts with 8 resize handles (4 edge + 4 corner)', () => {
    const page = renderInPage(
      { type: 'whiteout', left: 10, top: 10, width: 20, height: 10, color: '#ffffff' },
      () => {}
    );
    // 4 edge handles + 4 corner handles
    const resizers = page.querySelectorAll('.sign-element-resizer');
    expect(resizers.length).toBe(8);
    expect(page.querySelector('.sign-element-resizer.corner.top-left')).not.toBeNull();
    expect(page.querySelector('.sign-element-resizer.corner.bottom-right')).not.toBeNull();
  });

  it('whiteout height resize fires onChange with updated height via bottom handle', () => {
    const onChange = vi.fn();
    const page = renderInPage(
      { type: 'whiteout', left: 10, top: 10, width: 20, height: 10, color: '#ffffff' },
      onChange
    );
    const bottomHandle = page.querySelector('.sign-element-resizer.bottom');
    expect(bottomHandle).not.toBeNull();

    act(() => {
      bottomHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 140 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalled();
    const committed = onChange.mock.calls.at(-1)[0];
    expect(committed).toHaveProperty('height');
    expect(committed).toHaveProperty('width');
  });

  it('rectangle corner (bottom-right) resize fires onChange with both width and height', () => {
    const onChange = vi.fn();
    const page = renderInPage(
      { type: 'rectangle', left: 10, top: 10, width: 20, height: 15, strokeWidth: 2 },
      onChange
    );
    const cornerHandle = page.querySelector('.sign-element-resizer.corner.bottom-right');
    expect(cornerHandle).not.toBeNull();

    act(() => {
      cornerHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 130, clientY: 125 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalled();
    const committed = onChange.mock.calls.at(-1)[0];
    expect(committed).toHaveProperty('width');
    expect(committed).toHaveProperty('height');
  });
});

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ShapeNode from './ShapeNode.jsx';

function mount(vnode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

describe('ShapeNode component', () => {
  let host;

  afterEach(() => {
    if (host) {
      document.body.removeChild(host);
      host = null;
    }
  });

  it('renders an ellipse SVG element correctly when type is ellipse', () => {
    const element = {
      type: 'ellipse',
      color: '#ff00ff',
      strokeWidth: 4
    };

    host = mount(
      <ShapeNode
        element={element}
        isActive={true}
        onResizeStart={() => {}}
      />
    );

    const ellipse = host.querySelector('ellipse');
    expect(ellipse).not.toBeNull();
    expect(ellipse.getAttribute('stroke')).toBe('#ff00ff');
    expect(ellipse.getAttribute('stroke-width')).toBe('4');
    expect(ellipse.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(ellipse.getAttribute('cx')).toBe('50');
    expect(ellipse.getAttribute('cy')).toBe('50');
  });

  it('renders a rect SVG element correctly when type is rectangle', () => {
    const element = {
      type: 'rectangle',
      color: '#00ff00',
      strokeWidth: 2
    };

    host = mount(
      <ShapeNode
        element={element}
        isActive={true}
        onResizeStart={() => {}}
      />
    );

    const rect = host.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect.getAttribute('stroke')).toBe('#00ff00');
    expect(rect.getAttribute('stroke-width')).toBe('2');
    expect(rect.getAttribute('rx')).toBe('4');
    expect(rect.getAttribute('width')).toBe('98');
    expect(rect.getAttribute('height')).toBe('98');
  });
});

import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach } from 'vitest';
import ShapeNode from './ShapeNode.tsx';
import type { EllipseElement, RectangleElement } from '../../../editor/model/editorModel.ts';
import type { NodeResizeStart } from '../nodeProps.ts';

const onResizeStart: NodeResizeStart = () => {};

function ellipseElement(overrides: Partial<EllipseElement> = {}): EllipseElement {
  return { id: 'ellipse-1', type: 'ellipse', pageIndex: 0, left: 0, top: 0, width: 10, height: 10, ...overrides };
}

function rectangleElement(overrides: Partial<RectangleElement> = {}): RectangleElement {
  return { id: 'rectangle-1', type: 'rectangle', pageIndex: 0, left: 0, top: 0, width: 10, height: 10, ...overrides };
}

function mount(vnode: ComponentChildren): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to be rendered`);
  return element;
}

describe('ShapeNode component', () => {
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    if (host) {
      document.body.removeChild(host);
      host = null;
    }
  });

  it('renders an ellipse SVG element correctly when type is ellipse', () => {
    const element = ellipseElement({
      color: '#ff00ff',
      strokeWidth: 4
    });

    host = mount(
      <ShapeNode
        element={element}
        isActive={true}
        onResizeStart={onResizeStart}
      />
    );

    const ellipse = requireElement<SVGEllipseElement>(host, 'ellipse');
    expect(ellipse).not.toBeNull();
    expect(ellipse.getAttribute('stroke')).toBe('#ff00ff');
    expect(ellipse.getAttribute('stroke-width')).toBe('4');
    expect(ellipse.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(ellipse.getAttribute('cx')).toBe('50');
    expect(ellipse.getAttribute('cy')).toBe('50');
  });

  it('renders a rect SVG element correctly when type is rectangle', () => {
    const element = rectangleElement({
      color: '#00ff00',
      strokeWidth: 2
    });

    host = mount(
      <ShapeNode
        element={element}
        isActive={true}
        onResizeStart={onResizeStart}
      />
    );

    const rect = requireElement<SVGRectElement>(host, 'rect');
    expect(rect).not.toBeNull();
    expect(rect.getAttribute('stroke')).toBe('#00ff00');
    expect(rect.getAttribute('stroke-width')).toBe('2');
    expect(rect.getAttribute('rx')).toBe('4');
    expect(rect.getAttribute('width')).toBe('98');
    expect(rect.getAttribute('height')).toBe('98');
  });
});

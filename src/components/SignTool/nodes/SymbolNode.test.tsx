import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SymbolNode from './SymbolNode.tsx';
import type { SymbolElement } from '../../../editor/model/editorModel.ts';
import type { NodeResizeStart } from '../nodeProps.ts';

const onResizeStart: NodeResizeStart = () => {};

function symbolElement(overrides: Partial<SymbolElement> = {}): SymbolElement {
  return { id: 'symbol-1', type: 'symbol', pageIndex: 0, left: 0, top: 0, width: 10, height: 10, ...overrides };
}

function mount(element: SymbolElement): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(
      <SymbolNode
        element={element}
        isActive={false}
        onResizeStart={onResizeStart}
      />,
      host
    );
  });
  return host;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector} to be rendered`);
  return element;
}

describe('SymbolNode', () => {
  let host = document.createElement('div');

  afterEach(() => {
    if (host.isConnected) {
      act(() => render(null, host));
      host.remove();
    }
  });

  it('renders the selected X mark using the element color', () => {
    host = mount(symbolElement({ mark: 'x', color: '#000000' }));
    const colorHost = requireElement<HTMLDivElement>(host, 'div');
    const path = requireElement<SVGPathElement>(host, 'path');

    expect(colorHost.style.color).toBe('rgb(0, 0, 0)');
    expect(path).not.toBeNull();
    // The exporter's geometry, which the editor now shares (symbolMarks.ts).
    // This used to be `M18 6L6 18`, a third smaller than the cross the same
    // element exported - the drift that module exists to prevent.
    expect(path.getAttribute('d')).toBe('M4 4L20 20M20 4L4 20');
  });

  it('renders dot marks from the same mark field used by toolbar and export', () => {
    host = mount(symbolElement({ mark: 'dot', color: '#ff3300' }));
    const dot = requireElement<SVGCircleElement>(host, 'circle');

    expect(dot).not.toBeNull();
    expect(dot.getAttribute('fill')).toBe('currentColor');
  });
});

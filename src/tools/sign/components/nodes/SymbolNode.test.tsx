import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SymbolNode from './SymbolNode.tsx';
import type { SymbolElement } from '../../../../editor/model/editorModel.ts';
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

  // MOBI-19 follow-up: a symbol tapped onto a detected printed checkbox is
  // sized to match the print - a few px on a phone - and its four fixed-10px
  // corner handles rendered as one solid blob (reported live; a real
  // checkbox measured 4.28x4.28px put every handle pair at roughly -7px of
  // overlap). SymbolNode's own job is only the measurement - it hands
  // `.symbol .resizer` in EditorElement.module.css one raw value per axis,
  // `--half-width`/`--half-height`, and that CSS does the actual
  // shrink-and-separate arithmetic (`clamp()`/`max()`) that guarantees the
  // handles never overlap, however small the symbol gets. jsdom has no CSS
  // engine to evaluate that arithmetic (editor.md: "these need a real
  // browser... jsdom can only assert middleware config and committed
  // state") - the two raw values reaching the DOM correctly is what a unit
  // test here can prove; a real rendered non-overlap check is
  // resizer-handle-spacing.spec.js.
  describe('passes its measured size to the resize handles', () => {
    let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;
    let mockWidth = 0;
    let mockHeight = 0;

    beforeEach(() => {
      originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function (this: Element) {
        if (this.hasAttribute('data-editor-symbol-visual')) return new DOMRect(0, 0, mockWidth, mockHeight);
        return originalGetBoundingClientRect.call(this);
      };
    });

    afterEach(() => {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    const halfSizeOf = (h: HTMLElement) => {
      const resizer = requireElement<HTMLElement>(h, '[data-editor-resizer="top-left"]');
      return { width: resizer.style.getPropertyValue('--half-width'), height: resizer.style.getPropertyValue('--half-height') };
    };

    it('halves the measured size for a symbol sized to a detected printed checkbox', () => {
      mockWidth = 4.28;
      mockHeight = 4.28;
      host = document.createElement('div');
      document.body.appendChild(host);
      act(() => {
        render(<SymbolNode element={symbolElement()} isActive onResizeStart={onResizeStart} />, host);
      });
      expect(halfSizeOf(host)).toEqual({ width: '2.14px', height: '2.14px' });
    });

    it('halves the measured size for a normally sized symbol too', () => {
      mockWidth = 20;
      mockHeight = 20;
      host = document.createElement('div');
      document.body.appendChild(host);
      act(() => {
        render(<SymbolNode element={symbolElement()} isActive onResizeStart={onResizeStart} />, host);
      });
      expect(halfSizeOf(host)).toEqual({ width: '10px', height: '10px' });
    });

    it('updates every resize handle, not just one', () => {
      mockWidth = 4.28;
      mockHeight = 4.28;
      host = document.createElement('div');
      document.body.appendChild(host);
      act(() => {
        render(<SymbolNode element={symbolElement()} isActive onResizeStart={onResizeStart} />, host);
      });
      const handles = [...host.querySelectorAll<HTMLElement>('[data-editor-resizer]')];
      expect(handles.length).toBe(4);
      for (const handle of handles) {
        expect(handle.style.getPropertyValue('--half-width')).toBe('2.14px');
        expect(handle.style.getPropertyValue('--half-height')).toBe('2.14px');
      }
    });
  });
});

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SymbolNode from './SymbolNode.jsx';

function mount(element) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(
      <SymbolNode
        element={element}
        isActive={false}
        onResizeStart={() => {}}
      />,
      host
    );
  });
  return host;
}

describe('SymbolNode', () => {
  let host;

  afterEach(() => {
    if (host) {
      act(() => render(null, host));
      host.remove();
      host = null;
    }
  });

  it('renders the selected X mark using the element color', () => {
    host = mount({ type: 'symbol', mark: 'x', color: '#000000' });
    const colorHost = host.querySelector('div');
    const path = host.querySelector('path');

    expect(colorHost.style.color).toBe('rgb(0, 0, 0)');
    expect(path).not.toBeNull();
    expect(path.getAttribute('d')).toContain('M18 6L6 18');
  });

  it('renders dot marks from the same mark field used by toolbar and export', () => {
    host = mount({ type: 'symbol', mark: 'dot', color: '#ff3300' });
    const dot = host.querySelector('circle');

    expect(dot).not.toBeNull();
    expect(dot.getAttribute('fill')).toBe('currentColor');
  });
});

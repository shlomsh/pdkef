import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScanSizeRow from './ScanSizeRow.tsx';

let container: HTMLElement | null = null;
function mount(props: Record<string, unknown> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  const onLimit = vi.fn();
  act(() => render(<ScanSizeRow sizeText={null} limit="none" onLimit={onLimit} limitNote={undefined} {...props} />, container!));
  return { container, onLimit };
}
afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
});

describe('ScanSizeRow', () => {
  it('shows the label and the size as the large value', () => {
    const { container } = mount({ sizeText: '1.2 MB' });
    expect(container.textContent).toContain('Size');
    expect(container.querySelector('[data-size-value]')?.textContent).toBe('1.2 MB');
  });

  it('shows Updating while the size is not known, keeping the value element', () => {
    const { container } = mount({ sizeText: null });
    expect(container.querySelector('[data-size-value]')?.textContent).toBe('Updating…');
  });

  it('offers the four limits inline and reports a choice', () => {
    const { container, onLimit } = mount();
    const radios = [...container.querySelectorAll('[role="radio"]')] as HTMLElement[];
    expect(radios.map((r) => r.textContent)).toEqual(['Full', '2 MB', '1 MB', '500 KB']);
    act(() => radios[2].click());
    expect(onLimit).toHaveBeenCalledWith('1mb');
  });

  it('shows the limit note under the options', () => {
    const { container } = mount({ limitNote: 'As small as these go.' });
    expect(container.querySelector('[data-option-note]')?.textContent).toBe('As small as these go.');
  });
});

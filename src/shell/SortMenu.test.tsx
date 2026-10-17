import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SortMenu from './SortMenu.tsx';

const OPTIONS = [
  { value: 'custom', label: 'Your order' },
  { value: 'nameAsc', label: 'Name A-Z' },
  { value: 'nameDesc', label: 'Name Z-A' },
];

describe('SortMenu', () => {
  let container: HTMLElement | null = null;

  afterEach(() => {
    if (container) {
      act(() => render(null, container as HTMLElement));
      container.remove();
      container = null;
    }
  });

  function mount(value = 'custom', onChange = vi.fn(), hideLabel = false) {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(
        <SortMenu label="Order" ariaLabel="Sort images" value={value} options={OPTIONS} onChange={onChange} hideLabel={hideLabel} />,
        container as HTMLElement,
      );
    });
    return onChange;
  }

  it('shows the label and the selected option on the trigger', () => {
    mount('nameAsc');
    expect(container?.textContent).toContain('Order');
    const trigger = container?.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toBe('Sort images: Name A-Z');
  });

  it('hides the visible label when asked, keeping the aria-label', () => {
    mount('custom', vi.fn(), true);
    expect(container?.textContent).not.toContain('Order');
    expect(container?.querySelector('button[aria-label="Sort images: Your order"]')).not.toBeNull();
  });

  it('opens a listbox and reports the chosen value', () => {
    const onChange = mount();
    const trigger = container?.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    act(() => trigger.click());
    const option = document.querySelector('[role="option"][data-value="nameDesc"]') as HTMLButtonElement;
    expect(option).not.toBeNull();
    act(() => option.click());
    expect(onChange).toHaveBeenCalledWith('nameDesc');
  });
});

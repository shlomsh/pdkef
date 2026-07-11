import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import ColorPickerMenu from './ColorPickerMenu.jsx';

describe('ColorPickerMenu (Popover Refactor)', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    // Clean up any portals mounted to body
    document.body.innerHTML = '';
  });

  it('renders the menu in a Portal at the document root to avoid CSS clipping bugs', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <ColorPickerMenu value="#000000" onChange={() => {}} title="Test Color" />,
        container
      );
    });

    const triggerBtn = container.querySelector('button');
    expect(triggerBtn).not.toBeNull();

    // Open the popover
    await act(async () => {
      triggerBtn.click();
    });

    // It should NOT be a child of the container (inline). 
    // It should be portaled to document.body.
    const inlineMenu = container.querySelector('[data-editor-color-menu]');
    expect(inlineMenu).toBeNull();

    // Check if it exists in the body instead (this is the expected behavior for the refactor)
    const portaledMenu = document.body.querySelector('[data-editor-color-menu]');
    expect(portaledMenu).not.toBeNull();
  });

  it('uses the [data-editor-signature-popover] class instead of the overloaded .sign-dropdown-menu class', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    act(() => {
      render(
        <ColorPickerMenu value="#000000" onChange={() => {}} title="Test Color" />,
        container
      );
    });

    // Open the popover
    await act(async () => {
      container.querySelector('button').click();
    });

    // Grab the menu (wherever it rendered)
    const menu = document.body.querySelector('[data-editor-color-menu]');
    expect(menu).not.toBeNull();

    expect(menu.classList.contains('sign-dropdown-menu')).toBe(false);
    expect(menu.hasAttribute('data-editor-color-menu')).toBe(true);
  });
});

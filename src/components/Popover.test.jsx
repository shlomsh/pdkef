import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import Popover from './Popover.jsx';

describe('Popover Component', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
  });

  it('renders without crashing and mounts trigger element', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const trigger = <button id="popover-trigger">Click me</button>;
    const content = <div id="popover-content">Popover content</div>;

    act(() => {
      render(<Popover trigger={trigger} content={content} />, container);
    });

    // Verify the trigger was rendered (this also proves no ReferenceError was thrown during setup, e.g. missing hooks)
    const btn = container.querySelector('#popover-trigger');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Click me');
  });

  it('portals content into the document body when opened', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const trigger = <button id="popover-trigger">Click me</button>;
    const content = <div id="popover-content">Popover content</div>;

    act(() => {
      // Force it open to verify portal behavior
      render(<Popover trigger={trigger} content={content} open={true} />, container);
    });

    // Content should be in the body (or fullscreenElement), not inside the container
    const popoverContent = document.body.querySelector('#popover-content');
    expect(popoverContent).not.toBeNull();
    expect(popoverContent.textContent).toBe('Popover content');
    
    // It should NOT be in the immediate container
    expect(container.querySelector('#popover-content')).toBeNull();
  });
});

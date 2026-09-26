// @ts-nocheck - renamed from .jsx, not yet typed; see TODO.md 'Type the interactive shell'
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, vi } from 'vitest';
import Popover, { createPopoverMiddleware } from './Popover.tsx';

// SNG-17: `anchorClosest` calls `refs.setPositionReference`, an internal
// detail of `useFloating`'s returned ref object that jsdom's layout-free
// `getBoundingClientRect()` cannot surface any other way (every position
// resolves to 0,0,0,0 regardless of what was anchored). Patch the real
// hook's `refs` object *in place*, once per instance, so the spy records
// what it was called with while every other behaviour - including every
// other assertion in this file - still runs through Floating UI's own
// implementation. `refs` is stable across renders (Floating UI keeps it in
// a ref), and Popover.tsx's own effect depends on that identity staying
// put; returning a freshly spread `refs` object here instead broke that and
// sent `setPositionReference` (which itself triggers a Floating UI state
// update) into an infinite render loop.
const setPositionReferenceSpy = vi.fn();
const patchedRefs = new WeakSet<object>();
vi.mock('@floating-ui/react', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useFloating: (options) => {
      const result = actual.useFloating(options);
      if (!patchedRefs.has(result.refs)) {
        const original = result.refs.setPositionReference;
        result.refs.setPositionReference = (node) => {
          setPositionReferenceSpy(node);
          original(node);
        };
        patchedRefs.add(result.refs);
      }
      return result;
    },
  };
});

describe('Popover Component', () => {
  let container;

  afterEach(() => {
    if (container) {
      act(() => render(null, container));
      container.remove();
      container = null;
    }
    document.body.innerHTML = '';
    setPositionReferenceSpy.mockClear();
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

  it('can keep a dynamic picker anchored while its content changes height', () => {
    const middleware = createPopoverMiddleware(5, true);
    expect(middleware.map((entry) => entry.name)).toEqual(['offset', 'shift']);
    // Floating UI stores middleware options as the first tuple item.
    expect(middleware[1].options[0]).toEqual({ mainAxis: false, crossAxis: true, padding: 5 });
  });

  it('can move a picker away from content along the cross axis', () => {
    const middleware = createPopoverMiddleware(5, true, -36);
    expect(middleware[0].options[0]).toEqual({ mainAxis: 5, crossAxis: -36 });
  });

  it('keeps normal popovers collision-aware by default', () => {
    expect(createPopoverMiddleware().map((entry) => entry.name)).toEqual(['offset', 'flip', 'shift']);
  });

  it('replaces createPopoverMiddleware entirely when a middleware list is passed', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const custom = [{ name: 'custom', fn: () => ({}) }];
    const trigger = <button id="popover-trigger">Click me</button>;
    const content = <div id="popover-content">Popover content</div>;

    act(() => {
      render(<Popover trigger={trigger} content={content} open={true} middleware={custom} />, container);
    });

    // No crash and the content still renders; the middleware list itself is
    // an implementation detail of useFloating, so this is a smoke check that
    // passing `middleware` does not also apply `createPopoverMiddleware(...)`.
    expect(document.body.querySelector('#popover-content')).not.toBeNull();
  });

  it('positions against the closest anchorClosest ancestor of the trigger, not the trigger itself', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-editor-element', '');
    container.appendChild(wrapper);

    const trigger = <button id="popover-trigger">Click me</button>;
    const content = <div id="popover-content">Popover content</div>;

    act(() => {
      render(
        <Popover trigger={trigger} content={content} open={true} anchorClosest="[data-editor-element]" />,
        wrapper,
      );
    });

    expect(setPositionReferenceSpy).toHaveBeenCalledWith(wrapper);
    expect(setPositionReferenceSpy).not.toHaveBeenCalledWith(wrapper.querySelector('#popover-trigger'));
  });

  it('falls back to the trigger when no anchorClosest ancestor matches', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const trigger = <button id="popover-trigger">Click me</button>;
    const content = <div id="popover-content">Popover content</div>;

    act(() => {
      render(
        <Popover trigger={trigger} content={content} open={true} anchorClosest="[data-editor-element]" />,
        container,
      );
    });

    const btn = container.querySelector('#popover-trigger');
    expect(setPositionReferenceSpy).toHaveBeenCalledWith(btn);
  });

  it('never calls setPositionReference when anchorClosest is not given', () => {
    container = document.createElement('div');
    document.body.appendChild(container);

    const trigger = <button id="popover-trigger">Click me</button>;
    const content = <div id="popover-content">Popover content</div>;

    act(() => {
      render(<Popover trigger={trigger} content={content} open={true} />, container);
    });

    expect(setPositionReferenceSpy).not.toHaveBeenCalled();
  });
});

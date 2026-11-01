import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach } from 'vitest';
import useElementToolbarFloating from './useElementToolbarFloating.ts';
import { toolbarScaleOriginCss } from './visualViewportClamp.ts';
import { TOOLBAR_FLOATING_OFFSET } from '#editor/model/signGeometry.js';

type Hook = ReturnType<typeof useElementToolbarFloating>;

// Same tiny-harness pattern as useVisualViewportScale.test.tsx.
function mount(props: { rtl: boolean; coarse: boolean }): Hook {
  let result!: Hook;
  function Harness() {
    result = useElementToolbarFloating(props);
    return null;
  }
  const host = document.createElement('div');
  document.body.appendChild(host);
  mounted.push(host);
  act(() => render(<Harness />, host));
  return result;
}

const mounted: HTMLElement[] = [];
afterEach(() => {
  mounted.splice(0).forEach((host) => {
    render(null, host);
    host.remove();
  });
});

const gapOf = (hook: Hook) => String(hook.style.transform).match(/translateY\(calc\(-1 \* ([\d.]+)px/)?.[1];

describe('useElementToolbarFloating', () => {
  it('anchors the scale origin at the right edge for RTL', () => {
    expect(mount({ rtl: true, coarse: false }).style.transformOrigin).toBe(toolbarScaleOriginCss('top-end'));
  });

  it('anchors the scale origin at the left edge for LTR', () => {
    expect(mount({ rtl: false, coarse: false }).style.transformOrigin).toBe(toolbarScaleOriginCss('top-start'));
  });

  it('adds the coarse hit-area overhang to the gap on touch only', () => {
    const fine = Number(gapOf(mount({ rtl: false, coarse: false })));
    const coarse = Number(gapOf(mount({ rtl: false, coarse: true })));
    expect(fine).toBe(TOOLBAR_FLOATING_OFFSET);
    expect(coarse - fine).toBe(8);
  });

  it('returns the floating setters and update', () => {
    const hook = mount({ rtl: false, coarse: false });
    expect(typeof hook.setReference).toBe('function');
    expect(typeof hook.setFloating).toBe('function');
    expect(typeof hook.update).toBe('function');
  });
});

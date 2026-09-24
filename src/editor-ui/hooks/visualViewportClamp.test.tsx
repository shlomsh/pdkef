import { describe, expect, it, afterEach } from 'vitest';
import visualViewportClamp, { originFromPlacement, toolbarScaleOriginCss, getStickyToolShellRect } from './visualViewportClamp.ts';

/**
 * Unit-level coverage of the pure clamp math, independent of a real Floating
 * UI pipeline or a real browser - the actual containment-under-pinch claim is
 * what `src/tools/sign/e2e/toolbar-zoom-physical-size.spec.js` proves in a
 * real engine (real `getBoundingClientRect()`, real CSS transforms, a real
 * CDP pinch). This file is for the arithmetic itself: given a
 * `MiddlewareState`-shaped object and a mocked `visualViewport`, does
 * `visualViewportClamp` return an x/y whose resulting *visible* rect
 * (post counter-scale, from the correct anchor corner) actually lands inside
 * `visualViewport`, rather than asserting the internal offsetParent-relative
 * numbers by hand (fragile, and would just re-derive the source's own
 * arithmetic instead of checking its result).
 */

type Scenario = {
  x: number;
  y: number;
  floatingWidth: number;
  floatingHeight: number;
  referenceRect: { x: number; y: number };
  referenceViewportRect: { left: number; top: number; width: number; height: number };
  placement?: string;
};

function installVisualViewport(rect: { scale: number; offsetLeft: number; offsetTop: number; width: number; height: number }) {
  Object.defineProperty(window, 'visualViewport', { value: rect, configurable: true, writable: true });
}

function removeVisualViewport() {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true, writable: true });
}

/** A real DOM element whose `getBoundingClientRect()` is stubbed to a fixed
 * rect - the pattern `editor.md` calls for ("Geometry tests must mock a
 * realistic page rect"); jsdom's own layout always reports 0x0. */
function elementAt(rect: { left: number; top: number; width: number; height: number }): Element {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top }),
  });
  return el;
}

/** Builds a minimal Floating UI `MiddlewareState`-shaped object: only the
 * fields `visualViewportClamp.fn` actually reads. */
function middlewareState({ x, y, floatingWidth, floatingHeight, referenceRect, referenceViewportRect, placement = 'top-start' }: Scenario) {
  return {
    x,
    y,
    placement,
    rects: {
      floating: { width: floatingWidth, height: floatingHeight },
      reference: { ...referenceRect, width: 0, height: 0 },
    },
    elements: {
      reference: elementAt(referenceViewportRect),
      floating: document.createElement('div'),
    },
  } as unknown as Parameters<NonNullable<ReturnType<typeof visualViewportClamp>['fn']>>[0];
}

function runClamp(scenario: Scenario, opts: Parameters<typeof visualViewportClamp>[0] = {}) {
  return visualViewportClamp(opts).fn(middlewareState(scenario)) as { x?: number; y?: number };
}

/** The bar's true on-screen (visible, post counter-scale) rect for a given
 * (x, y) - reimplements only the geometry, not the clamp/shift logic itself,
 * so it is a meaningful check of the middleware's *output* rather than a
 * restatement of its algorithm. */
function visibleRect(scenario: Scenario, x: number, y: number, scale: number) {
  const deltaX = scenario.referenceViewportRect.left - scenario.referenceRect.x;
  const deltaY = scenario.referenceViewportRect.top - scenario.referenceRect.y;
  const origin = originFromPlacement(scenario.placement ?? 'top-start');
  const visibleWidth = scenario.floatingWidth / scale;
  const visibleHeight = scenario.floatingHeight / scale;
  const left = x + deltaX + origin.x * (scenario.floatingWidth - visibleWidth);
  const top = y + deltaY + origin.y * (scenario.floatingHeight - visibleHeight);
  return { left, top, right: left + visibleWidth, bottom: top + visibleHeight };
}

describe('originFromPlacement / toolbarScaleOriginCss', () => {
  it('anchors the bottom-left corner for top-start (LTR bar above its element)', () => {
    expect(originFromPlacement('top-start')).toEqual({ x: 0, y: 1 });
    expect(toolbarScaleOriginCss('top-start')).toBe('0% 100%');
  });

  it('anchors the bottom-right corner for top-end (RTL bar above its element)', () => {
    expect(originFromPlacement('top-end')).toEqual({ x: 1, y: 1 });
    expect(toolbarScaleOriginCss('top-end')).toBe('100% 100%');
  });

  it("anchors the top-center for plain bottom (Redact's flip() fallback)", () => {
    expect(originFromPlacement('bottom')).toEqual({ x: 0.5, y: 0 });
    expect(toolbarScaleOriginCss('bottom')).toBe('50% 0%');
  });
});

describe('visualViewportClamp', () => {
  afterEach(() => {
    removeVisualViewport();
    document.body.innerHTML = '';
  });

  it('is a no-op when there is no visualViewport at all', () => {
    removeVisualViewport();
    const scenario: Scenario = {
      x: 0, y: 0, floatingWidth: 100, floatingHeight: 40,
      referenceRect: { x: 0, y: 0 },
      referenceViewportRect: { left: 0, top: 0, width: 10, height: 10 },
    };
    expect(runClamp(scenario)).toEqual({});
  });

  it('is a no-op when the bar already sits fully inside the visible viewport', () => {
    installVisualViewport({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 440, height: 956 });
    const scenario: Scenario = {
      x: 50, y: 50, floatingWidth: 100, floatingHeight: 40,
      referenceRect: { x: 50, y: 90 },
      referenceViewportRect: { left: 50, top: 90, width: 20, height: 10 },
    };
    expect(runClamp(scenario)).toEqual({});
  });

  it('pulls a bar hanging off the right edge back inside, using the VISIBLE (scaled-down) width, not the layout width', () => {
    // Reproduces the real repro this ticket is about: a wide (340px layout)
    // RTL bar, pinch-zoomed 3x so only a ~147px-wide slice is visible, its
    // right edge still anchored where shift()/size() left it (against the
    // whole unzoomed page) - see the file header and MOBI-17.md.
    const scale = 3;
    installVisualViewport({ scale, offsetLeft: 0, offsetTop: 300, width: 146.67, height: 300 });
    const scenario: Scenario = {
      x: 49.98, y: 378.23, floatingWidth: 340, floatingHeight: 80,
      referenceRect: { x: 58.98, y: 474.23 },
      referenceViewportRect: { left: 58.98, top: 474.23, width: 24, height: 8 },
      placement: 'top-end',
    };
    const before = visibleRect(scenario, scenario.x, scenario.y, scale);
    expect(before.right, 'non-vacuity: this really does hang off the right at rest').toBeGreaterThan(146.67);

    const result = runClamp(scenario);
    expect(result.x).not.toBeUndefined();
    const after = visibleRect(scenario, result.x!, scenario.y, scale);
    expect(after.left).toBeGreaterThanOrEqual(0 + 4 - 0.01);
    expect(after.right).toBeLessThanOrEqual(146.67 - 4 + 0.01);
  });

  it('clamps a bar overflowing the left edge back to the margin', () => {
    installVisualViewport({ scale: 1, offsetLeft: 100, offsetTop: 0, width: 300, height: 900 });
    const scenario: Scenario = {
      x: 10, y: 50, floatingWidth: 80, floatingHeight: 30,
      referenceRect: { x: 10, y: 90 },
      referenceViewportRect: { left: 10, top: 90, width: 10, height: 10 },
    };
    const result = runClamp(scenario);
    const after = visibleRect(scenario, result.x!, result.y ?? scenario.y, 1);
    expect(after.left).toBeCloseTo(100 + 4, 5);
    expect(after.top, 'the vertical edge never overflowed, so it stays put').toBeCloseTo(50, 5);
  });

  it('never lets the bar render under the sticky tool strip, pushing its top down to clear it', () => {
    installVisualViewport({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 440, height: 900 });
    const scenario: Scenario = {
      x: 20, y: 30, floatingWidth: 100, floatingHeight: 40,
      referenceRect: { x: 20, y: 80 },
      referenceViewportRect: { left: 20, top: 80, width: 20, height: 10 },
    };
    const result = runClamp(scenario, { getExcludedRect: () => ({ bottom: 60 }) as DOMRect });
    expect(result.y).not.toBeUndefined();
    const after = visibleRect(scenario, scenario.x, result.y!, 1);
    expect(after.top).toBeCloseTo(60 + 4, 5);
  });

  it('leaves the sticky-strip check alone once the bar already clears it', () => {
    installVisualViewport({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 440, height: 900 });
    const scenario: Scenario = {
      x: 20, y: 90, floatingWidth: 100, floatingHeight: 40,
      referenceRect: { x: 20, y: 140 },
      referenceViewportRect: { left: 20, top: 140, width: 20, height: 10 },
    };
    const result = runClamp(scenario, { getExcludedRect: () => ({ bottom: 60 }) as DOMRect });
    expect(result).toEqual({});
  });

  it('pins to the leading edge (rather than fighting itself) when the bar is wider than the visible slice', () => {
    installVisualViewport({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 50, height: 900 });
    const scenario: Scenario = {
      x: 20, y: 30, floatingWidth: 400, floatingHeight: 40,
      referenceRect: { x: 20, y: 80 },
      referenceViewportRect: { left: 20, top: 80, width: 10, height: 10 },
    };
    const result = runClamp(scenario);
    const after = visibleRect(scenario, result.x!, scenario.y, 1);
    expect(after.left).toBeCloseTo(0 + 4, 5);
  });

  it('accounts for an offsetParent-relative/viewport delta (reference rects do not coincide)', () => {
    // Floating UI's own coordinate space (rects.reference / state.x/y) is
    // offset from getBoundingClientRect()'s viewport space by a constant -
    // e.g. the offset parent has scrolled, or sits below the top of the page.
    installVisualViewport({ scale: 1, offsetLeft: 0, offsetTop: 0, width: 200, height: 900 });
    const scenario: Scenario = {
      x: 500, y: 500, floatingWidth: 60, floatingHeight: 20, // offsetParent-relative, far from viewport-space numbers
      referenceRect: { x: 500, y: 540 }, // same offsetParent-relative space as x/y
      referenceViewportRect: { left: 20, top: 100, width: 10, height: 10 }, // viewport-relative: delta is (-480, -440)
    };
    // Un-clamped visible rect: left = x + deltaX = 500 + (20-500) = 20; top =
    // y + deltaY = 500 + (100-540) = 60 - both already well inside [0,200]x[0,900].
    expect(runClamp(scenario)).toEqual({});
  });
});

describe('getStickyToolShellRect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when no [data-tool-shell] is mounted', () => {
    expect(getStickyToolShellRect()).toBeNull();
  });

  it('returns the rect of the mounted [data-tool-shell] element', () => {
    const el = document.createElement('div');
    el.setAttribute('data-tool-shell', '');
    Object.defineProperty(el, 'getBoundingClientRect', { value: () => ({ bottom: 77 }) });
    document.body.appendChild(el);
    expect(getStickyToolShellRect()?.bottom).toBe(77);
  });
});

import { describe, it, expect } from 'vitest';
import { classifyTouchTap, isBlankAreaTarget, type TapGestureSample } from './tapOutsideDeselect.ts';

function sample(overrides: Partial<TapGestureSample> = {}): TapGestureSample {
  return {
    x: 100,
    y: 200,
    time: 1000,
    viewportScale: 1,
    viewportOffsetLeft: 0,
    viewportOffsetTop: 0,
    scrollTop: 0,
    ...overrides,
  };
}

describe('classifyTouchTap', () => {
  it('is a tap when start and end are identical', () => {
    const start = sample();
    const end = sample();
    expect(classifyTouchTap(start, end)).toBe(true);
  });

  it('is a tap when movement stays within the slop', () => {
    const start = sample();
    const end = sample({ x: 100 + 10, y: 200 }); // 10 screen pt at scale 1, under the 16pt default
    expect(classifyTouchTap(start, end)).toBe(true);
  });

  it('is not a tap once movement exceeds the slop (a pan)', () => {
    const start = sample();
    const end = sample({ x: 100, y: 200 + 80 }); // an 80px one-finger scroll-pan
    expect(classifyTouchTap(start, end)).toBe(false);
  });

  it('scales movement by the viewport zoom in effect at touch-start', () => {
    const start = sample({ viewportScale: 2 });
    // 9 CSS px * 2x zoom = 18 screen pt, over the 16pt default slop.
    const end = sample({ x: 100 + 9, y: 200, viewportScale: 2 });
    expect(classifyTouchTap(start, end)).toBe(false);
  });

  it('is not a tap when a second touch joined at any point in the sequence', () => {
    const start = sample();
    const end = sample(); // no movement at all
    expect(classifyTouchTap(start, end, { multiTouch: true })).toBe(false);
  });

  it('is not a tap when held past the duration limit (a long press)', () => {
    const start = sample({ time: 0 });
    const end = sample({ time: 600 });
    expect(classifyTouchTap(start, end)).toBe(false);
  });

  it('is a tap right at the duration limit', () => {
    const start = sample({ time: 0 });
    const end = sample({ time: 500 });
    expect(classifyTouchTap(start, end)).toBe(true);
  });

  it('is not a tap when the scroll container moved underneath the finger', () => {
    const start = sample({ scrollTop: 0 });
    const end = sample({ scrollTop: 60 }); // scrolled while the finger stayed put on screen
    expect(classifyTouchTap(start, end)).toBe(false);
  });

  it('is not a tap when the visual viewport panned (pinch-zoom drag) underneath the finger', () => {
    const start = sample({ viewportOffsetTop: 0 });
    const end = sample({ viewportOffsetTop: 40 });
    expect(classifyTouchTap(start, end)).toBe(false);
  });

  it('is not a tap when the viewport scale changed meaningfully during the touch', () => {
    const start = sample({ viewportScale: 1 });
    const end = sample({ viewportScale: 1.3 });
    expect(classifyTouchTap(start, end)).toBe(false);
  });

  it('tolerates negligible floating-point scale drift', () => {
    const start = sample({ viewportScale: 1 });
    const end = sample({ viewportScale: 1.0001 });
    expect(classifyTouchTap(start, end)).toBe(true);
  });

  it('respects a caller-supplied slop and duration', () => {
    const start = sample({ time: 0 });
    const end = sample({ x: 105, time: 50 });
    expect(classifyTouchTap(start, end, {}, { slopScreenPoints: 4, maxDurationMs: 1000 })).toBe(false);
    expect(classifyTouchTap(start, end, {}, { slopScreenPoints: 10, maxDurationMs: 10 })).toBe(false);
    expect(classifyTouchTap(start, end, {}, { slopScreenPoints: 10, maxDurationMs: 1000 })).toBe(true);
  });
});

describe('isBlankAreaTarget', () => {
  const EXCLUDED = '[data-editor-element], [data-editor-actions], [data-editor-resizer], button';

  it('is true for a plain div not matched by the excluded selector', () => {
    const div = document.createElement('div');
    expect(isBlankAreaTarget(div, EXCLUDED)).toBe(true);
  });

  it('is false for the element itself when it matches the excluded selector', () => {
    const el = document.createElement('div');
    el.setAttribute('data-editor-element', '');
    expect(isBlankAreaTarget(el, EXCLUDED)).toBe(false);
  });

  it('is false for a descendant of an excluded element (closest, not exact match)', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-editor-actions', '');
    const child = document.createElement('span');
    parent.appendChild(child);
    expect(isBlankAreaTarget(child, EXCLUDED)).toBe(false);
  });

  it('is false for a control such as a button', () => {
    const button = document.createElement('button');
    expect(isBlankAreaTarget(button, EXCLUDED)).toBe(false);
  });

  it('is false for a non-Element target (e.g. a text node or null)', () => {
    expect(isBlankAreaTarget(null, EXCLUDED)).toBe(false);
    const text = document.createTextNode('hi');
    expect(isBlankAreaTarget(text as unknown as EventTarget, EXCLUDED)).toBe(false);
  });
});

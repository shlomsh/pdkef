import { afterEach, expect } from 'vitest';
import { matchMedia, resetScreen } from './screen.ts';
import { sameFile } from './fileEquality.ts';

// Vitest global setup. jsdom doesn't implement every browser API the components
// legitimately use, so we provide minimal stubs here rather than weakening the
// production code to accommodate the test environment.

// Forced: jsdom has no ResizeObserver, used by DraggableOverlayElement to keep overlay scaling in sync
// with the page's rendered size. jsdom has no layout engine, so a no-op stub is
// sufficient — the components' one-shot synchronous measure still runs; only the
// ongoing "notify on resize" behavior (which jsdom can't produce anyway) is stubbed.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Forced: jsdom has no IntersectionObserver, used by useCurrentPage.js to track the fullscreen
// page indicator. Same reasoning as ResizeObserver above - a no-op keeps
// components that use it mountable; tests that care about the callback
// behavior install their own controllable mock instead.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no matchMedia; this one evaluates each query against the screen state a test sets with
// setScreen (src/test/support/screen.ts), a desktop by default. A real browser (the browser project
// loads this file too) keeps its own.
if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  // Forced: jsdom has no matchMedia at all.
  window.matchMedia = matchMedia;
  afterEach(() => resetScreen());
}

// Keep jsdom's intentionally-unimplemented browser APIs from drowning out a
// real test diagnostic. These are the two known, benign messages emitted by
// existing tests: component code may attempt canvas rendering (which jsdom
// cannot rasterise), and links may receive an otherwise ordinary click. Keep
// every other jsdom error visible so this cannot become a blanket warning sink.
if (typeof window !== 'undefined' && window._virtualConsole) {
  const knownJsdomError = /Not implemented: (HTMLCanvasElement(?:'s (?:getContext\(\)|toDataURL\(\)) method: without installing the canvas npm package)|navigation to another Document)/;
  window._virtualConsole.removeAllListeners('jsdomError');
  window._virtualConsole.on('jsdomError', (error) => {
    if (!knownJsdomError.test(error?.message ?? '')) console.error(error);
  });
}

expect.addEqualityTesters([sameFile]);

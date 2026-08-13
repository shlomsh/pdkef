// Vitest global setup. jsdom doesn't implement every browser API the components
// legitimately use, so we provide minimal stubs here rather than weakening the
// production code to accommodate the test environment.

// ResizeObserver: used by DraggableOverlayElement to keep overlay scaling in sync
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

// IntersectionObserver: used by useCurrentPage.js to track the fullscreen
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

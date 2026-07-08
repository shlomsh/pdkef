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

import fs from 'fs';
import path from 'path';

try {
  const htmlPath = path.resolve(process.cwd(), 'dist/index.html');
  if (fs.existsSync(htmlPath)) {
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let cssContent = '';
    let match;
    while ((match = styleRegex.exec(htmlContent)) !== null) {
      cssContent += match[1] + '\n';
    }
    
    if (cssContent && typeof document !== 'undefined') {
      const styleEl = document.createElement('style');
      styleEl.textContent = cssContent;
      document.head.appendChild(styleEl);
    }
  } else {
    console.warn('⚠️ dist/index.html not found. Run `npm run build` before tests for CSS assertions.');
  }
} catch (e) {
  console.error('Failed to inject CSS into jsdom:', e);
}

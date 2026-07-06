import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// Static output only — no SSR, no adapter. The app is a flat set of
// files served by Vercel; all PDF processing happens in the browser.
//
// No PWA build plugin: vite-plugin-pwa's closeBundle hook does not survive
// Astro's multi-pass static build (its output never reached the final
// dist/), and the Astro-native wrapper (@vite-pwa/astro) doesn't yet
// certify Astro 7. Instead, public/sw.js is a small hand-written service
// worker (see CLAUDE.md) — fully auditable, zero extra build dependencies.
export default defineConfig({
  site: 'https://pdkef.com',
  output: 'static',
  integrations: [preact()],
  // These are only reachable through dynamic import() inside the Preact
  // islands (SortableJS in PdfMergeTool, pdfjs-dist/@pdf-lib/fontkit in
  // several tools), so Vite's static startup crawl never finds them. Left
  // unlisted, the *first* real page load after any node_modules/.vite cache
  // clear has to discover and bundle them on the fly — that request 503s
  // while bundling, and the astro-island dynamic import fails before Vite's
  // resulting full-reload can rescue it, permanently breaking hydration
  // (and the file input's onChange) until a manual page reload. Listing
  // them here forces Vite to bundle them at server startup instead of
  // racing discovery against the first real navigation.
  vite: {
    optimizeDeps: {
      include: ['sortablejs', '@cantoo/pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist'],
    },
  },
  // Astro computes exact sha256 hashes for every inline script/style it
  // emits (the astro-island hydration bootstrap, JSON-LD blocks) and bakes
  // them into a <meta http-equiv="Content-Security-Policy"> tag on every
  // build. This is what lets us run a strict CSP (no 'unsafe-inline')
  // without the hashes going stale on the next Astro upgrade or content
  // edit — vercel.json's header CSP only adds frame-ancestors, which
  // <meta> CSP can't express. Only active in `build`/`preview`, not `dev`.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
        "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com",
        "worker-src 'self' blob:",
        "img-src 'self' data: blob: https://www.google-analytics.com",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "manifest-src 'self'",
      ],
    },
  },
});

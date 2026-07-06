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
  // CSP is managed entirely via vercel.json HTTP headers rather than
  // Astro's <meta> CSP. Two reasons: (1) Google Analytics requires
  // external domains and 'unsafe-inline' which Astro's undocumented
  // scriptDirective API fights; (2) dual CSPs (meta + header) are
  // cumulative, so we can't split responsibilities. The vercel.json
  // header is the single source of truth. Only active in production;
  // dev has no CSP.
});

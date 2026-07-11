import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';

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
  integrations: [preact({ compat: true })],
  build: {
    inlineStylesheets: 'always',
  },
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
    // Tailwind v4 is CSS-first: this plugin compiles the `@import`s in
    // src/styles/global.css (theme + utilities layers only — Preflight/base
    // is intentionally NOT imported, since it would reset margin/padding/
    // border on every element site-wide, a restyle out of scope for E3.1).
    // Utilities are available now but nothing in src/**/*.astro consumes
    // them yet — that migration is a separate ticket (E3.2), scoped to the
    // static/marketing surface only, per ARCHITECTURE.md §3.1.
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ['sortablejs', '@cantoo/pdf-lib', '@pdf-lib/fontkit', 'pdfjs-dist', '@floating-ui/react'],
    },
  },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "manifest-src 'self'"
      ],
      scriptDirective: { src: ["'self'"] },
      styleDirective: { src: ["'self'"] }
    }
  }
});

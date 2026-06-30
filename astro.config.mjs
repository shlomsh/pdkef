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
  site: 'https://pdf-merge-online-free.vercel.app',
  output: 'static',
  integrations: [preact()],
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
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "img-src 'self' data: blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "manifest-src 'self'",
      ],
    },
  },
});

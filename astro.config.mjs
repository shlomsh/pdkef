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
  site: 'https://pdfmerge.example.com',
  output: 'static',
  integrations: [preact()],
});

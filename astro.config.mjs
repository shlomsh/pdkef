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
    // Every page carries its whole stylesheet inline. This looks wasteful and is
    // measured to be correct anyway, so do not "fix" it: 'auto' was built and
    // benchmarked head to head (2026-08-20) and lost every scenario tested.
    //
    // The waste is real. 'always' ships 1,060,961 raw bytes of inline CSS across
    // the 20 built pages for 107,384 bytes of distinct rules, and it is the single
    // biggest input to check-css-duplication.js's 9.73x duplication factor.
    // Switching to 'auto' drops total build HTML from 2.04 MB to 1.01 MB raw and
    // the service-worker precache from 12,050,788 to 11,114,237 raw bytes.
    //
    // It still loses, because bytes are not the binding constraint here, round
    // trips are. An external <link rel="stylesheet"> is render-blocking and is
    // discovered only after the document is parsed, so it serializes one extra
    // RTT in front of first paint, and Astro emits no preload for it. Measured
    // brotli, first view of /sign/: 41,723 inline vs 43,097 external, so 'auto'
    // is worse on bytes AND adds the round trip. Modelled render-blocking time
    // (both a plain bandwidth model and one with TCP slow start) puts 'auto'
    // behind on every page at every network profile tried: +150ms on slow 4G,
    // +60ms on fast 4G, +25ms on broadband.
    //
    // The multi-page argument does not rescue it either. 'auto' does not emit one
    // shared stylesheet; it emits six, and only global.css is used by all 20
    // pages. The other five cover 1 to 9 pages each, so moving between two tool
    // pages usually discovers a fresh sheet and pays the RTT again. A four-view
    // journey saves 24,016 brotli and spends three extra round trips, netting
    // +330ms on slow 4G. Even an idealized hybrid, where only global.css is
    // external and every per-page sheet stays inline, saves ~6,441 brotli per
    // later view and needs 5 (slow 4G) to 15 (broadband) page views in ONE
    // session to repay its single round trip. This site's traffic is cold
    // single-page visits from search, and Lighthouse Performance >= 95 is a
    // stated SEO invariant, so the first view is the case that matters most.
    //
    // Two guardrails also assume this setting and go blind without it, which is
    // a reason to change it deliberately rather than casually:
    // check-css-duplication.js and check-page-weight.js both read only inline
    // <style>. Under 'auto' the duplication factor reads 1.72x instead of 9.73x
    // and per-page dead bytes read 0, while check-page-weight.js silently stops
    // counting 6,753 to 13,966 brotli of render-blocking CSS per page. If this
    // ever does flip, teach both scripts to follow <link rel="stylesheet"> in the
    // same change.
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
    // Every entry below must stay listed. The failure is not "one slow first
    // request" but a cascade: each dep Vite discovers late bumps the optimizer's
    // browserHash, and every module already resolved under the previous hash
    // then 504s as `Outdated Optimize Dep`. Vite's recovery is a full reload
    // pushed over HMR, so a *single* late discovery is survivable — but several
    // in one page load strand the astro-island bootstrap and the dev toolbar
    // together, the toolbar's own dynamic import throws inside initApp, and the
    // HMR channel dies before the rescue reload is ever sent. What you see then
    // is `Cannot read properties of undefined (reading '__H')` from
    // preact_hooks (two optimizer generations of Preact live in one page) and an
    // island that never mounts, so the PDF silently never renders. Clearing
    // node_modules/.vite does not help: the next load rebuilds the same
    // cascade. Verify with one load after a cache clear — every
    // /node_modules/.vite/deps/ request must carry the *same* ?v= hash.
    optimizeDeps: {
      include: [
        'sortablejs',
        '@cantoo/pdf-lib',
        '@pdf-lib/fontkit',
        'pdfjs-dist',
        '@floating-ui/react',
        // Reached only from an island: SignatureDialog.tsx (signature_pad) and
        // every icon call site (lucide-preact), neither of which Vite's startup
        // crawl of the .astro entry points can see.
        'signature_pad',
        'lucide-preact',
        // Same shape as fontkit above: only src/lib/bidiRuns.js imports it,
        // which is only reachable through src/editor/registry/text.ts's
        // serialize(), itself only reachable from inside the Sign/Redact
        // islands - invisible to the startup crawl of the .astro entry points.
        'bidi-js',
        // Imported from BaseLayout's bundled analytics script, so it is
        // discovered on first navigation rather than at startup.
        '@vercel/analytics',
      ],
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
      // Hand-computed hash for the one `is:inline` script in the app
      // (ToolPageLayout.astro's draft-hint reader). Astro only auto-hashes
      // scripts it bundles; `is:inline` opts out of bundling on purpose,
      // because that script must block parsing and run before first paint —
      // a bundled script compiles to type="module", which is always deferred
      // and would run too late. This hash goes stale the instant that
      // script's text changes by even one byte; ToolPageLayout.astro's
      // comment on the script has the exact command to recompute it.
      scriptDirective: {
        src: ["'self'"],
        hashes: ['sha256-SkN9DQL0i7KQnTpCN2Y0vdVHs8X+lzFpiOz88pu1A2E=']
      },
      styleDirective: { src: ["'self'"] }
    }
  }
});

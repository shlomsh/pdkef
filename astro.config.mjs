import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwindcss from '@tailwindcss/vite';
import { entryFileName, chunkFileName, assetFileName, cssAssetKeys, cssModuleClassName } from './scripts/stableNames.mjs';

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
  // Shiki emits token colours as style attributes, which strict CSP blocks.
  // Prism uses CSS classes instead; add a Prism stylesheet if fenced Markdown
  // code blocks are introduced in the future.
  markdown: {
    syntaxHighlight: 'prism',
  },
  build: {
    // Small sheets inline, larger ones linked (Vite's assetsInlineLimit decides). Measured on both
    // axes for MEM-27 (2026-10-29, builds of 1b72a77d), and 'auto' wins on balance:
    //
    // Update cost, what a returning visitor's worker downloads after a style deploy (brotli, with
    // MEM-26's stable CSS names on both sides). 'always' inlined each CSS Module into every page that
    // uses it, so a 12-line edit to PdfTool.module.css (42923db to 1b72a77) re-downloaded 21 tool pages:
    // 787,290 bytes. A 5-line ToolPageLayout.astro edit (1b72a77 to 686e27e) read 782,106. With 'auto'
    // the pages keep their stable /shared/ links and only the sheet changes: 37,637 and 32,410.
    // 'never' read about the same (37,204, 31,979).
    //
    // First paint, cold view (Chromium, CDP throttling, median of 7, no worker): a linked sheet is
    // render-blocking and found only after the head arrives, so it costs about one round trip.
    // 'auto' against 'always', FCP on /, /sign/, /merge/, /compress/: slow 4G +188, +196, +184, +180 ms;
    // fast 4G +56, -56, +20, +56; broadband +16, +40, +20, +24 (the 2026-08-20 model predicted +150,
    // +60, +25). 'never' links 4 to 15 sheets and cost more everywhere (slow 4G +216 to +400). That
    // round trip was weighed against re-downloading every tool page on each style edit, and the
    // site deploys several times a day; the 2026-08-20 decision had measured first paint only.
    //
    // The CSS guards read a page's linked sheets as well as its inline <style> (scripts/pageCss.mjs):
    // check-css-duplication.js, check-dead-utilities.js, and check-page-weight.js, which counts linked
    // sheets in the first-load budget. Changing this again changes what those guards measure.
    inlineStylesheets: 'auto',
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
    plugins: [tailwindcss(), cssAssetKeys],
    // The pdf.js worker wrapper (src/lib/pdf/pdfjsWorker.js) is a module worker with a dynamic
    // import inside pdf.js, which the default iife worker format cannot code-split (DEBT-42).
    worker: { format: 'es' },
    // MEM-25: client entries and the hot shared chunks keep one URL across deploys. Client environment
    // only; the server environment (prerender) must keep Astro's own JS naming. MEM-26: CSS Module class
    // names hash the module's path, not its CSS, and CSS files are named by the modules they hold, in
    // prerender too (Astro pairs a client stylesheet with the one it inlined by file name), so a style
    // edit changes only the CSS it touches.
    environments: {
      client: { build: { rolldownOptions: { output: { entryFileNames: entryFileName, chunkFileNames: chunkFileName, assetFileNames: assetFileName('client') } } } },
      prerender: { build: { rolldownOptions: { output: { assetFileNames: assetFileName('prerender') } } } },
    },
    css: { modules: { generateScopedName: cssModuleClassName } },
    build: {
      rollupOptions: {
        output: {
          // Name the two PDF libraries after themselves.
          //
          // Rollup names a chunk after one of its constituent modules, which for
          // a package means its entry file. `@cantoo/pdf-lib`'s entry is
          // `es/index.js`, so 628 KiB of pdf-lib shipped as `es.<hash>.js` - a
          // name that says nothing. It cost real time: a PageSpeed report was
          // read as "pdf.js is eager" because a neighbouring chunk happened to
          // be named after a two-line hook inside it, and the actual culprit
          // was hiding behind `es.` (DEBT-20).
          //
          // These names are also what `scripts/check-lazy-modules.js` keys on.
          // `/^es\./` would be a guard one unrelated package could collide
          // with; `/^pdf-lib\./` cannot be anything else.
          //
          // This only names chunks. It does not decide what loads eagerly -
          // that follows the static import graph, and is the guard's business.
          // pdf-lib only, and pdf.js deliberately not. Naming a manual chunk
          // for pdfjs-dist was tried and reverted: Rollup then folded Vite's
          // `__vitePreload` helper into it, and since the island bootstrap
          // imports that helper statically, all 421 KiB became eager on every
          // page. `test:lazy-modules` caught it, which is the second time in
          // this one change that the guard paid for itself. pdf.js already
          // ships as `pdf.<hash>.js`, which is legible enough.
          manualChunks(id) {
            if (id.includes('node_modules/@cantoo/pdf-lib/')) return 'pdf-lib';
            return undefined;
          },
        },
      },
    },
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
        // Same shape as fontkit above: only src/editor/text/bidiRuns.js imports it,
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
        // Recomputed for MEM-01: the script now reads the per-tool "current
        // entry" pointer (pdf-toolkit:workspace:current:<slug>) instead of
        // the retired has-draft:<slug> hint key - see ToolPageLayout.astro's
        // comment on the script.
        // HERO-02: the script also reads the hand-off marker
        // (pdkef:handoff-pending:<slug>, src/lib/handoff/handoffPending.ts).
        hashes: ['sha256-k9N098sQ2ZQ4WGEI7pGLQ+4OTGgOerwkeRCYX2z1yg4=']
      },
      styleDirective: { src: ["'self'"] }
    }
  }
});

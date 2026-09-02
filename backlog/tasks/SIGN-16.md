---
id: "SIGN-16"
title: "Trustworthy delivery checks and docs"
status: "open"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# SIGN-16 · Trustworthy delivery checks and docs

## Scope and acceptance

**Trustworthy delivery checks and docs.** Count transitive static imports in the page-weight gate, remove duplicated CI builds where safe, and align README commands/Node requirements/privacy with reality. Document layer ownership, persistence/export contracts, language fixtures, and baseline generation. Keep Chromium output tests and production CSP checks as release gates; platform baseline differences require investigation, not blanket tolerance increases. **Three concrete items observed 2026-08-29 (finalize pass), all small and none blocking:** (1) **CI is on deprecated action runtimes.** `actions/checkout@v4`, `actions/setup-node@v4` and `actions/upload-artifact@v4` all target Node 20 and GitHub is already force-running them on Node 24, which it annotates on every run ([changelog](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/)). Bump all three to `@v5`; the workflow's own `node-version` is `22.x` and is unaffected. (2) **`verify-csp.js` warns `No CSP meta tag found in dist/google2c4730f55b90649a.html`.** That is the Google Search Console verification file, a 54-byte `public/` passthrough with no scripts, so the warning is correct but harmless. Either skip non-Astro passthrough files in the checker or leave it, but do not "fix" it by injecting a CSP into a file whose exact bytes Google verifies. (3) **`astro check` reports 24 hints, 0 errors, 0 warnings** - almost all `ts(6133)` unused imports/locals spread across `PdfSignTool.tsx`, `PdfSecurityTool.tsx`, `PdfSplitTool.tsx`, `PdfToImageTool.tsx`, `SignTool/PdfWorkspace.tsx`, `pages/index.astro` and `scripts/check-gesture-golden-rule.js`. Harmless, but they are the noise that hides a real hint later; worth one sweep while this ticket is open.

**Current evidence 2026-09-02:** `astro check` is still green but now reports **26
hints**, including four undeclared `window.__fontkit` accesses in e2e helpers. The unit
suite passes 1,895 tests but emits a very large stream of expected jsdom canvas and
navigation "Not implemented" messages, making a new warning easy to miss; install
targeted test shims or filter only the exact known messages. The public privacy copy is
also internally contradictory: `README.md:19` promises "no tracking, no network calls"
and `public/llms.txt:18` says "No trackers, cookies, or analytics", while
`BaseLayout.astro` injects Vercel Analytics in production and `CLAUDE.md` correctly
documents same-origin page-view analytics. Align every public surface with the approved
anonymous-telemetry policy without weakening the separate promise that PDF content is
never uploaded. The red CSS and temporary-e2e-bundle regressions are tracked separately
as SIGN-22 and reopened SIGN-21 because they currently fail release commands.

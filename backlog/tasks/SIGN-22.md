---
id: "SIGN-22"
title: "Restore the CSS release gate after adding language-request actions"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "release-blocker"
depends_on: []
legacy_state: "Done 2026-09-03 — emitted project tokens replace invalid utilities"
---

# SIGN-22 · Restore the CSS release gate after adding language-request actions

## Scope and acceptance

**`npm run test:css` is red on current `main` (`501071b`).** The two links added in
`src/components/ToolLanguagesCard.astro:105-106` use `text-sm`; the primary action also
uses `text-white`. Both classes reach `dist/sign/index.html` but compile to no CSS under
the project's Tailwind theme, so the dead-utility guard fails and the primary link can
lose its intended contrast. Replace them with existing project tokens/arbitrary values
or declare the missing theme tokens deliberately. Do not allowlist visual classes that
are supposed to paint. Acceptance: `npm run build`, `npm run test:css`, and the Sign page
contrast/appearance check pass without changing the language-request behavior.

**Resolved 2026-09-03.** The language-request actions now use emitted arbitrary-value
tokens: `text-[0.875rem]` replaces `text-sm`, and the primary link uses
`text-[var(--color-surface)]` instead of the undeclared `text-white`. A production build
and `npm run test:css` pass, including the class-resolution and dead-utility guards.

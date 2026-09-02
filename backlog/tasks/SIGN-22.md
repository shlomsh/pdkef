---
id: "SIGN-22"
title: "Restore the CSS release gate after adding language-request actions"
status: "open"
priority: "P1"
epic: "sign-tool-architecture"
phase: "release-blocker"
depends_on: []
legacy_state: "Open — raised 2026-09-02 from current main"
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

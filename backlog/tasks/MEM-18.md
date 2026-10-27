---
id: "MEM-18"
title: "CI budgets each page's precache closure and keeps tool-specific assets out of other tools' closures"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 1
depends_on: ["MEM-15"]
---

# MEM-18 · CI budgets each page's precache closure and keeps tool-specific assets out of other tools' closures

*Filed 2026-10-27* from a loading measurement of origin/main.

## Why

- `scripts/check-page-weight.js` budgets first paint (`MAX_FIRST_LOAD_BROTLI = 400_000` per page) and
  eager images. `scripts/check-lazy-modules.js` keeps named engines out of first paint. Neither looks at
  what the service worker downloads, at wasm, or at fonts.
- That gap is how the precache reached 5.2 MB on the wire unnoticed: a tool's assets (Scan's guide
  photos, Sign's export chunk) reach every visitor of every other tool.

## Outcome

- A check reads the per-page closures from MEM-15's manifest and sums each one's brotli size from
  `dist/`. It fails when a page's closure exceeds its budget, and when an asset that belongs to one tool's
  folder appears in another tool's closure.
- Budgets are budgets, not ratchets (CLAUDE.md): set from the heaviest measured tool plus stated headroom,
  in one place beside the page-weight budget.
- It runs in CI after `build`, with the other weight checks.

## Acceptance

- [ ] Adding a large asset to one tool's closure fails the check with the page, the asset and the bytes.
- [ ] Importing a Scan-only module from Redact fails the cross-tool rule, naming both tools.
- [ ] The budget numbers and the measured closures they came from are written in the Done section.

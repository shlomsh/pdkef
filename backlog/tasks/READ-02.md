---
id: "READ-02"
title: "Move the shared highlight and comment pieces out of Sign, no behaviour change"
status: "open"
priority: "P2"
epic: "highlight-pdf"
horizon: "next"
order: 1
depends_on: []
---

# READ-02 · The highlight and comment pieces move out of Sign

*Filed 2026-11-01.* Design record: [docs/highlight-pdf.md](../../docs/highlight-pdf.md), section Engineering.

## Outcome

Everything Highlight PDF and Sign will both use lives in `src/editor/` or `src/editor-ui/`, placed by
`docs/module-boundaries.md`: the line reader and band geometry (`lib/highlight/`), the swipe gesture
(`hooks/highlightSwipeGesture.ts`), the swatches, the comment rail, sheet and cards
(`components/comments/`), the highlight and comment nodes, and the import and read-back
(`lib/comments/`). Sign-only code stays in Sign. Sign behaves exactly as before.

## Acceptance

- [ ] `npm run test:module-boundaries` and `test:editor-dependency-directions` pass with the new homes.
- [ ] The Sign highlight and comment unit tests and e2e specs pass unchanged apart from import paths.
- [ ] No file under `src/tools/sign/` is imported from outside Sign.

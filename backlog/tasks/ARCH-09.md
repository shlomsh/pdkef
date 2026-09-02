---
id: "ARCH-09"
title: "Make translated documentation freshness enforceable"
status: "open"
priority: "P2"
epic: "editor-architecture"
phase: "near-term"
depends_on: ["ARCH-07"]
legacy_state: "Open — raised 2026-09-02 from localization re-audit"
---

# ARCH-09 · Make translated documentation freshness enforceable

## Scope and acceptance

**Published translations can become silently stale.** The localized content schema in
`src/content.config.ts` requires a manually entered `sourceVersion`, reviewer, date, and
notes, but nothing compares `sourceVersion` with the current English page. A later
English safety, privacy, browser, offline, or language-support correction can therefore
leave an older translation published with valid schema and hreflang metadata. Define a
stable source revision or normalized source hash for each English page, record it on
each translation, and fail the build when a `published` edition does not match. Drafts
may remain stale but the preview should identify them as such. Test a current
translation, a stale published translation, and a stale draft; document who updates the
revision and who approves publication. This is content-governance automation, not a
request to publish the existing Hebrew drafts or expand editor UI localization.

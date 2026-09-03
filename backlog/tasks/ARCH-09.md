---
id: "ARCH-09"
title: "Make translated documentation freshness enforceable"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "near-term"
depends_on: ["ARCH-07"]
legacy_state: "Done 2026-09-03"
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

**Completed 2026-09-03.** Localized entries now record a deterministic
`fnv1a64` hash of normalized English source content instead of a manual version
label. Static generation rejects a stale published translation, permits stale
drafts only in the gated preview build, and renders a locale-specific stale
review notice there. The existing Hebrew entries remain drafts and their hashes
now match their reviewed English sources. Tests cover current translations,
stale published translations, stale drafts, Unicode/newline normalization, and
schema-default normalization. The localization plan records the content-owner,
translator, native-reviewer, and engineering responsibilities.

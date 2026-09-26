---
id: "SIGN-35"
title: "A style chosen in a document also becomes the app default for new documents"
status: "in_progress"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-33"]
---

# SIGN-35 · A style chosen in a document also becomes the app default for new documents

*Filed 2026-09-26.* A refinement of SIGN-33, from Shlomi the same day.

## Shlomi's words (2026-09-26)

"when changing the font, font color etc it should be kept on the local document level but also override
the app default - the app is shipped with a blue color for text. i change it to black and also expect
future new documents to use black. if i go back and change the color of a specific document to blue, it
should apply to this document and future new documents but not change it for already existing documents
where i chose another color already."

## The rule

- **Three layers**, resolved key by key in one pure function next to `elementDefaultsFor`:
  1. the document's own `carried` style;
  2. the app-wide style: what the person last chose in any document;
  3. the shipped defaults.
- **Every explicit change writes both.** The document's `carried` updates as in SIGN-33, and the same
  choice merges into the app-wide style.
- **Existing documents keep their own keys.** A key a document never set falls through to the app-wide
  value, so it follows the person's latest choice.
- **Unchanged:** the signature pad's pen colour and thickness, and the saved signatures.

## Decisions (the lead's calls)

- **Size and direction stay with the document.** They describe one form, not the person: the size is fitted
  to that form's cells (SIGN-32: "a new document does not inherit another document's size"), and the
  direction is the language it is filled in (SIGN-32 reopened: "not a browser-wide preference"). An
  app-wide size would stop a new form's first field from sizing itself, and an app-wide RTL would open
  every field of an English form right to left.
- **The font goes app-wide only when it is picked.** A font the typing switched to, because the script
  needed it, is the language's, like the direction. It stays with the document.
- **Seeding is not choosing.** SIGN-32's "the first use seeds it" wrote the resolved font into a new
  document's `carried`. That would freeze a document the person never chose a font in against their later
  choices elsewhere. The font is no longer seeded: the three layers resolve to the same font for every
  field anyway. The size still seeds, because it is document-only and measured from the first field.
- **Storage:** one on-device record in `preferenceStore.ts`, validated key by key with the validator the
  draft's `carried` uses, so one bad value drops alone. It is read again whenever a document opens, so a
  choice made in another tab applies to the next document.

## Acceptance

- [ ] Unit tests for the three-layer resolution and for the dual write.
- [ ] The per-document-style e2e covers Shlomi's scenario: in A set black; a new C starts black; in B set
  blue; a new D starts blue; C, which never chose, now starts blue too; A is still black after a reload.
- [ ] SIGN-33's A/B/A still holds with the app-wide layer in between.
- [ ] SIGN-33's open line is done: no per-document key is left in `preferenceStore.ts` (Redact's
  `lastWhiteoutColor` stays, Redact reads it).
- [ ] SIGN-33, `.claude/rules/editor.md` and `CLAUDE.md` say "a new document starts from your latest
  choices", not "from the defaults".

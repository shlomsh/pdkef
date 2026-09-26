---
id: "SIGN-35"
title: "A style chosen in a document also becomes the app default for new documents"
status: "done"
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

- [x] Unit tests for the three-layer resolution and for the dual write.
- [x] The per-document-style e2e covers Shlomi's scenario: in A set black; a new C starts black; in B set
  blue; a new D starts blue; C, which never chose, now starts blue too; A is still black after a reload.
- [x] SIGN-33's A/B/A still holds with the app-wide layer in between.
- [x] SIGN-33's open line is done: no per-document key is left in `preferenceStore.ts` (Redact's
  `lastWhiteoutColor` stays, Redact reads it).
- [x] SIGN-33, `.claude/rules/editor.md` and `CLAUDE.md` say "a new document starts from your latest
  choices", not "from the defaults".

## Done (2026-09-26)

- **Model** (`src/editor/model/`): `resolveDocumentStyle` (the three layers), `appStylePatchFor` (what an
  explicit change sends app-wide), `DOCUMENT_ONLY_KEYS` and `appWideStyleOf`.
- **State:** `SignToolState.appStyle` with `SET_APP_STYLE`, which never bumps `documentRevision`.
  `LOAD_DOCUMENT` re-reads it from the device. `useDocumentStyle()` is the one resolved view every
  placement reads. The draft still saves only the document's own `carried`.
- **Dual write:** `src/tools/sign/chooseStyle.ts`, one call from `makeOnChange`.
- **Storage:** `getAppStyle`/`rememberAppStyle`, one record validated by `validateDocumentStyle` (the
  draft's own validator, now exported). The dead per-document keys are gone. The pen and Redact's
  `lastWhiteoutColor` stay.
- **Seeding:** only the size seeds.
- **Tests:** model, store, reducer, `chooseStyle`, and both placement hooks. The e2e is the A/B/A
  plus Shlomi's scenario, green 6/6 on repeat.
- **Noticed, not changed:** a free text box takes the carried alignment but has no align control
  (`ElementToolbar`'s `canAlign` needs a box spanning a field). On a one-line box that hugs its text,
  alignment is invisible. It shows on wrapped text. This was already true within a document since
  SIGN-33, and now it also reaches new documents.

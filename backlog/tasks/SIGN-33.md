---
id: "SIGN-33"
title: "Every setting a person chooses is remembered per document, and going back to a document brings its own back"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-32"]
---

# SIGN-33 · Every setting a person chooses is remembered per document, and going back to a document brings its own back

*Filed 2026-09-26.* SIGN-32 made the font, size and direction per document. This extends the same rule to
everything else a person sets while filling a form.

## Shlomi's example (2026-09-26)

1. I open document A and fill it in Hebrew: RTL, right alignment, blue ink, cream whiteout.
2. I open document B: a bigger font, English, LTR, a US date format that I reuse in several fields,
   white whiteout.
3. I go back to document A. I expect all of A's defaults: font, colour, date format, whiteout, and the
   rest. They are the ones I chose for that document.

## The rule

- One **document style** per document, carried from element to element exactly as SIGN-32 carries the font
  and size: the first use seeds it, an explicit change updates it, and a field's fit-shrink never writes
  back. It is saved with the document's draft and restored with it. A new document starts from the
  defaults.
- **Per document:** font, font size, direction, text colour, alignment, bold, italic, date format, symbol
  mark (✓ ✗ •), symbol size, shape line thickness, whiteout colour, signature width.
- **Stays with the person, across documents:** the signature pad's pen colour and thickness, and the
  saved signatures.
- Alignment, bold and italic are not remembered at all today; they join the document style.
- The browser-wide preferences for everything per document leave `preferenceStore.ts`.

## Shape (the lead's design call)

- One object replaces SIGN-32's three fields: `SignToolState.carried: Partial<DocumentStyle>`, with one
  action, `SET_CARRIED` (a partial patch), and one draft field, `extra.carried`. Each key is validated on
  restore on its own, so one bad value drops only itself.
- A draft written by SIGN-32 (`carriedFont`, `carriedFontSize`, `carriedDirection`) restores into
  `carried`.
- One place maps an element patch to what it carries (`fontFamily` to `font`, `color` to `color` or
  `whiteoutColor` by element type, and so on). `makeOnChange` calls it instead of one `remember*` per
  key.
- A new element reads its defaults from `carried`, then from the defaults. `fieldFontSize` stays the one
  sizing function.

## Acceptance

- [x] Shlomi's A/B/A example is an e2e spec against a real build, with a real reload, and it is green.
- [x] Unit tests: each key seeds, carries and restores; a malformed key drops alone; a SIGN-32 draft
  migrates; a new document starts from the defaults; the signature pen stays browser-wide.
- [ ] No per-document key is left in `preferenceStore.ts`.

## Done (2026-09-26)

- **Where it lives, apart from any UI** (so the next-generation Sign reuses it as is): the pure model modules
  - `src/editor/model/documentStyle.ts`: the style;
  - `carriedPatch.ts`: what an explicit change carries;
  - `elementDefaults.ts`: what a new element starts from. `elementDefaultsFor` covers every type, and
    `carriedTextStyle` covers alignment, bold and italic.
- **State and persistence:** the state is `SignToolState.carried`, with one action, `SET_CARRIED`. It persists
  in the draft's `extra.carried`, validated key by key, and a SIGN-32 draft migrates into it.
- **Wiring:** `makeOnChange` is one `carriedPatchFor` call, and the tap path and Next/Previous read `carried`.
  `SignDefaultsContext` is deleted, and Sign no longer reads or writes a browser-wide preference for any of
  these settings.
- **Acceptance:** `src/tools/sign/e2e/per-document-style.spec.js` is Shlomi's A/B/A, through recents with a
  real reload, and it is green. Whiteout is left out of the e2e: its carry is covered by `carriedPatch.test.ts`
  and PdfWorkspace's whiteout test.
- **Left, deliberately:**
  - The now-unused keys in `preferenceStore.ts`. Redact still reads `lastWhiteoutColor`, and the rest are dead
    keys. The rewrite removes them with the store's own tests.
  - A new **free** text box still starts LTR until typed into (`getEffectiveTextDirection`, a reported bug
    earlier). Only a field-spanned box takes the carried direction. That is Shlomi's call.

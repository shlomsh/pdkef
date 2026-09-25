---
id: "SIGN-32"
title: "One font, size and direction per document: they carry from field to field, and each field only shrinks the size to fit"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
---

# SIGN-32 · One font, size and direction per document: they carry from field to field, and each field only shrinks the size to fit

*Filed 2026-09-25* from Shlomi's report on the practice form (SNG-10): the ID number comb's digits came out
about half the size of the Full name text above them.

## Why it happened

The size of a new element on a detected field is decided in three places, by three rules:
- A text box on a cell grows toward 65% of the field's height, ignoring the remembered size. This is
  `cellFontSize`, changed in fb59ed27.
- A comb takes the remembered size and only shrinks it (`combFontSize`).
- Free text takes the remembered size.

The remembered size (`lastFontSize`) is a browser-wide preference, written only on A- or A+. A size
picked months ago on another document still drives today's comb. Nothing keeps one form consistent.
The chain is three bugs in one seam on one day: the comb hint (36f525d4), the Full name size (fb59ed27)
and this one.

## The rule (Shlomi, 2026-09-25)

"If the previous field chose the font size, it should have been saved to serve the next fields in line."
And: "within the same form it is common to use the same font and font size, this is the reason for saving
it persistent. if you calculated it for the first field and the user didnt correct it, then this is the
font, and font size to use."

- A document has one **carried font and font size**. They belong to the document (its draft), not to the
  browser. The font follows the same rule as the size: whatever the first field used, or what the person
  picked since, is what the next field gets.
- When a document has none yet, the first field it is needed for sets it from that field's own height.
  Free text on a document with none uses the default.
- A- or A+, or a font pick, on an element changes the carried size or font for everything placed after it.
  A size the first field computed and the person did not correct is the carried size.
- Each field **fits** the carried size: it shrinks the size only where the text would not fit the
  printed cell. The shrink applies to that element only and never changes the carried size.
- Combs, text cells, dates and free text all read **one function**. `cellFontSize`'s grow-to-fill special
  case goes.

## Acceptance

- [x] One sizing function, used by every placement path.
- [x] The carried size persists with the document's draft and survives a reload. A new document does not
  inherit another document's size.
- [x] A product-path test fills the practice form top to bottom (Full name, the ID comb, the dates, the
  postal comb, a free text box) and asserts that every element shares the carried size wherever the
  field fits it.
- [x] Unit tests cover the rule's edges: a first field sets the size, A+ carries forward, a narrow comb
  shrinks without changing the carried size, and a reload keeps the size.
- [x] Checked in a real browser, desktop and phone width.

## Done (2026-09-25)

- `fieldFontSize` (`src/editor/text/combPlacement.ts`) sizes every placement: text cells, combs, dates
  and free text. `cellFontSize`'s grow-to-fill special case is gone.
- The carried font and size live in `SignToolState` (`carriedFont`, `carriedFontSize`). They persist in
  Sign's draft `extra`, validated in `draftValidation.ts`, and are reset on `LOAD_DOCUMENT` for a new
  document. The browser-wide `lastFont` and `lastFontSize` preferences are removed; Redact never read them.
- **What carries:** A-, A+, a font pick, and a text box's resize drag, which is also the person correcting
  the size. A placement's own fit-shrink never carries.
- **Tests:** `carriedFontSize.practiceForm.test.tsx` fills the practice form in order and asserts one font
  and one size. Draft-validation tests cover missing and malformed carried values.
- **Browser:** checked at desktop and 390x844. A+ carries to the next field and survives a reload; another
  PDF starts fresh.

## Reopened (2026-09-26): the language's font and direction carry too

Shlomi: "new document starts with the default font, that's fine. when the user start typing in another
language it defaults to a font. both its font and ltr/rtl direction should be saved for the following
elements."

- A new document starts with the default font. That is confirmed.
- When typing in another script switches an element to that script's font, and to RTL where the script
  is right-to-left, that font and that direction become the document's carried values. The next element
  starts in them, with no retyping and no re-picking.
- Direction is carried per document, like the font and size. It is not a browser-wide preference.

- [x] Typing in another language carries the switched font and the direction to the next element placed
  (tap, Next/Previous, free text), persists with the draft, and a new document starts from the defaults.

## Done (2026-09-26, reopened section)

- `carriedDirection` joins `carriedFont`/`carriedFontSize` in `SignToolState`
  (`src/tools/sign/components/SignToolContext.tsx`): `null` on a fresh document, set by
  `SET_CARRIED_DIRECTION` whenever an element's typing or an explicit direction toggle changes its
  effective direction (`PdfWorkspace.tsx`'s existing `makeOnChange` → `rememberDirection`, now dispatching
  to the reducer instead of a browser preference), reset on `LOAD_DOCUMENT` for a new document, restored
  from a pre-existing document's draft otherwise.
- Font already worked this way: typing that switches an unpicked element's script-appropriate font
  (`TextNode.tsx`'s `fontFamilyExplicit === false` path, resolving through `fonts.js`) already stored the
  *resolved*, rendered family on the element, and `makeOnChange`'s existing `fontFamily`-in-fields branch
  already fed it to `rememberFont`/`carriedFont` - nothing to change there.
- Both placement paths (`useWorkspaceGestures.ts`'s tap, `useFieldNavigation.ts`'s Next/Previous) read
  `carriedDirection` for a new element's initial direction, ahead of a detected field's own printed
  direction once the document has one - a fresher signal that the person is filling this document in that
  direction right now. A document with nothing carried yet still falls back to the field's printed
  direction, preserving the original MOBI-06 fix (a Hebrew-printed form's fields open right-aligned before
  anything has been typed).
- Persisted in Sign's draft `extra.carriedDirection`, validated in `draftValidation.ts` (old drafts
  without it restore cleanly), reset with the rest of the document state on `LOAD_DOCUMENT`.
- The dead `lastDirection` browser-wide preference (written on every keystroke, never read back for a
  placement - a unit test even proved a fresh field ignored it) is removed from `preferenceStore.ts`,
  joining `lastFont`/`lastFontSize` which SIGN-32's first pass already removed.
- **Tests:** reducer (`SignToolContext.test.tsx`), draft validation round-trip and malformed/missing
  values (`draftValidation.test.ts`), the priority flip in both placement hooks
  (`useWorkspaceGestures.test.js`, `useFieldNavigation.test.ts`), and the PdfWorkspace-level story - typing
  Hebrew remembers both the resolved font and RTL, a later Latin element carries its own resulting
  direction, a new field takes the document's carried direction, a fresh document has nothing carried yet
  (`PdfWorkspace.test.tsx`).
- **Browser:** checked in a real preview (port 4183) with the practice form - typing Hebrew into Full
  name, tapping Employer starts it in Arimo (already Hebrew-capable, so the font didn't need to change)
  and RTL before any retyping, a full reload restores the carried direction onto the next untouched field,
  and opening a different, never-before-opened PDF in the same session starts fresh (LTR default), not
  inheriting the previous document's carried direction. `--project=export-guards` and `--project=fonts`
  both green (133 passed, 2 pre-existing skips unrelated to this change).

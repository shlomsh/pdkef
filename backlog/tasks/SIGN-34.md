---
id: "SIGN-34"
title: "A new text box starts in the document's direction, free or on a field; a generated date never changes it"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-33"]
---

# SIGN-34 · A new text box starts in the document's direction, free or on a field; a generated date never changes it

*2026-09-26.* Shlomi: "a free text box direction should derive from the document". This replaces an older
special case in `getEffectiveTextDirection` that forced an empty free box to LTR.

## The rule

- **One rule for every box.** Typed letters decide the direction first. Until then, the box uses the direction
  it was created with: the document's carried direction (SIGN-33). For a field on a document with nothing
  carried yet, that is the page's printed direction. Digits and dates stay LTR by design.
- **What sets the document's direction.** Only typed text sets it. A date's text is generated from its format,
  and a locale date reads "September" even on a Hebrew form, so `carriedPatchFor` never takes a direction from
  it. That was why document A lost its RTL.

## Acceptance

- [x] `per-document-style.spec.js` asserts that document A's next free box is RTL. It is green.
- [x] The six unit tests that encoded the old rule assert the new one.

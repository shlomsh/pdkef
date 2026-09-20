---
id: "MOBI-15"
title: "Browser proof for field navigation: which way the arrows point, and that the target clears the keyboard"
status: "open"
priority: "P3"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-06"]
legacy_state: "Open"
---

# MOBI-15 · Browser proof for field navigation: which way the arrows point, and that the target clears the keyboard

## Scope and acceptance

MOBI-06 shipped two behaviours that only exist once something has laid the page out, so jsdom cannot
see either of them and neither has a machine check. Both are exactly CLAUDE.md's e2e criterion -
"only for what jsdom cannot prove (rendered rects)" - and together they are about two specs.

**1. The arrows point the way the document reads.** The glyphs are mirrored in CSS, keyed off a
`dir` attribute the component sets from the document's own direction
(`.field-nav[dir="rtl"] .field-nav-button svg { transform: scaleX(-1) }`, `SignToolbar.module.css`).
CSS Modules are invisible to jsdom, so the unit tests can only prove the `dir` attribute, never the
picture. The bug this guards against shipped once already: the rule was keyed to the UI locale, so a
Hebrew form opened in the English edition pointed its arrows backwards.

Assert on an RTL fixture, in the English edition, that the button whose
`getBoundingClientRect().x` is smaller is the one that moves *forward* - and on an LTR fixture that
it is the one that moves *back*. Reading which is which from `disabled` at the first field is the
cheapest handle. The point of running it in the English edition is that locale must not enter into
it.

**2. The field a move lands on clears the on-screen keyboard.** `bringFieldIntoView`
(`useFieldNavigation.ts`) scrolls with `block: 'center'` and then, where `visualViewport` exists,
nudges again because the layout viewport does not shrink when the keyboard opens. Only the first
half has ever been observed. This was the last unproven acceptance clause on MOBI-06.

Playwright cannot raise a real on-screen keyboard, so prove the mechanism rather than the platform:
at a phone viewport, drive the same code path with a shrunken `visualViewport` and assert the
target's rect ends up inside it. A fixture that fakes `window.visualViewport` before the island
hydrates is enough, and is honest about what it covers - the nudge's arithmetic, not iOS.

**Acceptance.** Both specs live with the Sign e2e suite and fail if the CSS rule is re-keyed or the
second scroll is removed. Note for whoever picks this up: the pinned Playwright build was not
installed in the environment where MOBI-06 was written, which is why these were not written then.

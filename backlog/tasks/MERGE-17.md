---
id: "MERGE-17"
title: "One quiet line after the first merge: it works offline and can be installed"
status: "done"
priority: "P3"
epic: "merge-tool"
phase: "optional"
depends_on: ["MERGE-12"]
legacy_state: "Open"
---

# MERGE-17 · One quiet line after the first merge: it works offline and can be installed

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

The moment after a first successful merge is the one time a person is receptive to knowing that the
tool keeps working without a connection and can live on their home screen. Both facts are already
true (service worker, manifest, the "Works offline" chip). Say them once, in the `OfflineProof`
register: one sentence under the Download control, shown after the first result in this browser and
never again (a `localStorage` flag under the `pdf-toolkit:` prefix). No modal, no counter, no ask for a
GitHub star on a tool page; the chip in the app bar already carries that.

If the browser exposes `beforeinstallprompt`, the sentence gets an "Install" link that calls it;
otherwise it explains the browser's own Add to Home Screen path in one clause, iOS included.

**Acceptance.**

- The line appears once per browser after a first result, reads in the house voice, and is reviewed
  by Shlomi before shipping.
- Install link works where the prompt exists; the sentence is accurate where it does not.
- Localized string present for `/he/merge/`.

## Updates

- 2026-09-13: one sentence under Download after the first result in this browser
  (`pdf-toolkit:merge:first-result-seen`), never again: "This page is saved in your browser now, so
  merging works even without a connection." followed by an install link when the browser fired
  `beforeinstallprompt`, the Share / Add to Home Screen clause on iOS, or the browser-menu clause
  elsewhere. Hebrew present. The copy is an AI draft and needs Shlomi's review before deploy. Done
  pending that review.
- Direction A (2026-09-13): the install line appears once, in the Download element's saved state, not as fine print under a ready button.

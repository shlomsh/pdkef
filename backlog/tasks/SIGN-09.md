---
id: "SIGN-09"
title: "Direction defaults and native IME input"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-08-30"
---

# SIGN-09 · Direction defaults and native IME input

## Scope and acceptance

**Direction defaults and native IME input.** Direction follows the first strong typed letter, including Arabic Extended-A/B; empty, neutral, and digit-only fields default LTR even after editing RTL text, and the browser/export digit-order guards pass. The Chromium Sign-editor guard drives Chrome's actual IME candidate path through the DevTools Input domain, proves an Indic cluster survives two in-progress updates and one commit without losing focus, and remains LTR. Product scope is one language per text element plus digits: a different language belongs in a separate text box. Comb cells are not an acceptance requirement, so they do not promise full grapheme segmentation.

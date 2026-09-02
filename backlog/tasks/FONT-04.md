---
id: "FONT-04"
title: "Gujarati (~62M), Kannada (~44M), Odia"
status: "retired"
priority: "P3"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: ["FONT-02"]
legacy_state: "Retired 2026-09-02"
---

# FONT-04 · Gujarati (~62M), Kannada (~44M), Odia

## Scope and acceptance

~~**Gujarati (~62M), Kannada (~44M), Odia.**~~ Last three of the original six India scripts, all zero coverage. Retired rather than scheduled: language additions are now demand-driven - built when someone actually asks (via the footer's Feedback & ideas / Report a bug links, see [tools.js's `notYet` copy](../../src/data/tools.js)) rather than worked through a fixed backlog ahead of any request. Do not reopen speculatively; reopen when a request for one of these three lands, or if a strong case emerges that the catalogue is missing something significant enough to justify getting ahead of demand.

If reopened: **screen every candidate Noto face against a generated fontkit corpus before wiring anything** - Gurmukhi's and Telugu's default Noto Sans faces both crashed fontkit's `GPOSProcessor.getAnchor` and needed real replacements (Mukta Mahee, Anek Telugu), found only by running the corpus, not by trusting Noto's coverage claim. **Sequence after FONT-02.**

---
id: "FONT-04"
title: "Gujarati (~62M), Kannada (~44M), Odia"
status: "open"
priority: "P2"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: ["FONT-02"]
legacy_state: "Open"
---

# FONT-04 · Gujarati (~62M), Kannada (~44M), Odia

## Scope and acceptance

**Gujarati (~62M), Kannada (~44M), Odia.** Last three of the original six India scripts, all zero coverage. **Screen every candidate Noto face against a generated fontkit corpus before wiring anything** - Gurmukhi's and Telugu's default Noto Sans faces both crashed fontkit's `GPOSProcessor.getAnchor` and needed real replacements (Mukta Mahee, Anek Telugu), found only by running the corpus, not by trusting Noto's coverage claim. **Sequence after FONT-02.**

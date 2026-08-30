---
id: "FONT-03"
title: "Malayalam"
status: "in_progress"
priority: "P2"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "In progress — product support landed; export guard pending"
---

# FONT-03 · Malayalam

## Scope and acceptance

~~**Malayalam.**~~ **Product support landed; acceptance remains in progress.** Noto Sans Malayalam - the only candidate on record - was disqualified: fontkit's `GPOSProcessor.getAnchor` crashes 33/35 reph cases (RA+virama+consonant, syllable-initial - not rare, it's how Malayalam spells an initial /r/ before a cluster), the same fault class that blocked Gurmukhi/Telugu's Noto faces. **Anek Malayalam** (Ek Type, OFL 1.1, same family as the already-bundled Anek Telugu) replaces it: 0/478 fontkit crashes, 245/245 on the pixel-diff shaping guard (`e2e/sign/malayalam-shaping-guard.spec.js`, 400px, self-calibrating, zero named divergences), and 0 divergent cases on an advance-parity spot check against the SIGN-19 bound (max widthDiff 0.000px across all 478 cases). Deliberately tests reformed (post-1971) orthography, documented in `e2e/sign/fixtures/malayalamCorpus.js`'s module doc - a 478-case corpus built from the Unicode 17.0 Malayalam block chart and r12a's script notes, covering the axes Malayalam actually needs (pre-base E/EE/AI, two-part O/OO, reformed-spelling AU, reph, rakar, and chillu letters - the consonant-final forms with no equivalent in this catalogue's other Brahmic scripts). In progress: an `exportRenderCorpus.js` case plus its CI-captured baseline (via the `update-export-render-baseline` workflow input, same as FONT-05) is being added in a follow-up worktree session, learning from FONT-05 shipping a case without one once and going red - the case and the baseline are landing together this time. The research brief now exists at [docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md); screening followed its three-check protocol.

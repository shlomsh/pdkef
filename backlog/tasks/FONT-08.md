---
id: "FONT-08"
title: "Second-font / missing-style research across every single-font script"
status: "open"
priority: "P3"
epic: "fonts-and-script-support"
phase: "unspecified"
depends_on: []
legacy_state: "Open (FONT-08a's gap (a) fully closed 2026-08-29)"
---

# FONT-08 · Second-font / missing-style research across every single-font script

## Scope and acceptance

**Second-font / missing-style research across every single-font script.** Two distinct gaps: **(a) no upright/text-style option at all - now closed for both scripts.** Devanagari and Thai each had exactly one bundled face (Kalam, Mali) and both were handwriting, so an upright choice used to resolve the whole element to a handwritten look. **Devanagari:** Mukta (Ek Type, OFL) passed all three screening checks on the first candidate tried - see the Mukta writeup below. **Thai:** the top two ranked candidates, Sarabun and Kanit, both measurably failed the fontkit-vs-browser advance-parity check (Guard A) on ordinary Thai words (Sarabun 1.4-3.0% of string width, Kanit 0.3-1.0%) despite neither carrying `calt` - a real finding the three-check protocol exists to catch. **IBM Plex Sans Thai** landed instead: it does carry `calt` (flagged, and stress-tested specifically against the classic Thai tall-consonant/tone-mark collision case ปั๊กฝ้ายให้ฟังกิ๊บ) but passed Guard A cleanly (0.05px unhinted tolerance) on every sample including that stress case, so it shipped on the strength of the test rather than the flag - see `e2e/sign/thai-font-parity.spec.js`. **(b) single-font scripts with no second choice for variety** - Bengali, Punjabi/Gurmukhi, Telugu, Tamil, the Arabic family (Scheherazade New), Japanese, Chinese SC/TC, Korean, plus Cyrillic and Greek (both text-only today, no handwriting option either), and now also Thai's *handwriting* side (Mali is still the only Thai handwriting face). Named-but-unscreened candidates already on record: Sriracha (2nd Thai handwriting, same-day runner-up to Mali), a 2nd Cyrillic face, a 2nd Hebrew handwriting face, more Latin handwriting styles. **Research rules and the exact current catalogue to screen against: [docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md)** - landed in the repo as of `c1d7f13`; an earlier pass of this ticket found it referenced but missing, since fixed.

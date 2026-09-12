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

**Second-font / missing-style research across every single-font script.** Two distinct gaps. **(a) is closed** (Devanagari and Thai each had only a handwriting face; Mukta and IBM Plex Sans Thai landed 2026-08-29 - record kept below for how the screening went). **(b) is what remains.**

*(a), for the record:* Devanagari and Thai each had exactly one bundled face (Kalam, Mali) and both were handwriting, so an upright choice used to resolve the whole element to a handwritten look. **Devanagari:** Mukta (Ek Type, OFL) passed all three screening checks on the first candidate tried - see the Mukta writeup below. **Thai:** the top two ranked candidates, Sarabun and Kanit, both measurably failed the fontkit-vs-browser advance-parity check (Guard A) on ordinary Thai words (Sarabun 1.4-3.0% of string width, Kanit 0.3-1.0%) despite neither carrying `calt` - a real finding the three-check protocol exists to catch. **IBM Plex Sans Thai** landed instead: it does carry `calt` (flagged, and stress-tested specifically against the classic Thai tall-consonant/tone-mark collision case ปั๊กฝ้ายให้ฟังกิ๊บ) but passed Guard A cleanly (0.05px unhinted tolerance) on every sample including that stress case, so it shipped on the strength of the test rather than the flag - see `e2e/sign/thai-font-parity.spec.js`. **(b) single-font scripts with no second choice for variety** - Bengali, Punjabi/Gurmukhi, Telugu, Tamil, the Arabic family (Scheherazade New), Japanese, Chinese SC/TC, Korean, plus Cyrillic and Greek (both text-only today, no handwriting option either), and now also Thai's *handwriting* side (Mali is still the only Thai handwriting face). Named-but-unscreened candidates already on record: Sriracha (2nd Thai handwriting, same-day runner-up to Mali), a 2nd Cyrillic face, a 2nd Hebrew handwriting face, more Latin handwriting styles. **Research rules and the exact current catalogue to screen against: [docs/font-candidate-research-brief.md](./docs/font-candidate-research-brief.md)** - landed in the repo as of `c1d7f13`; an earlier pass of this ticket found it referenced but missing, since fixed.

## 2026-09-12: research pass, verified against bytes

A deep-research agent (Shlomi's, prompted from this ticket) produced a shortlist for every (b) gap;
every claim was then re-checked locally against the Google Fonts TTFs with this repo's fontkit: script
coverage, `calt`/stylistic sets, file size, copyright string, `glyf` alignment, and **check 1 (fontkit
crash) over the repo's own corpora** for Arabic+Pashto, Bengali, Gurmukhi, Telugu, Tamil, Malayalam and
Devanagari. Checks 2 and 3 are not run; they are landing work. Full per-candidate tables are in the
brief; the headlines:

- **Tiro Bangla is out**: fontkit never returns on ফ্র and শ্র (heap exhaustion at every cap tried). A
  hang, not a throw, so a new failure class nothing in `signPdf` could turn into a clean refusal.
  **Hind Siliguri** (0/256) is the only Bengali candidate left.
- **Cairo is out** (no Pashto, variable-only). **Vazirmatn** is the Arabic pick, `calt` flagged.
- **The report's Greek section was inverted**: Patrick Hand has no Greek; Mansalva and Mynerve both do,
  both with `calt`. It also had the wrong foundry for Tillana (ITF, not Ek Type), wrong `calt` claims for
  Sriracha, Marck Script and Vazirmatn, sizes off by up to 3x, and seven of nineteen copyright lines
  wrong. Coverage, licenses and repos were right. Lesson recorded in the brief: never copy a copyright
  line or a `calt` claim from a research report.
- **Amatic SC** covers Hebrew and Cyrillic in one 148KB caps-only file; a candidate for two gaps.
- Clean on check 1 with `glyf` aligned: Vazirmatn, Hind Siliguri, Tiro Gurmukhi, Suranna (610KB, no
  Bold), Tiro Tamil, Mukta Malar, Catamaran, Gayathri, Neucha, Marck Script, Amatic SC, Mansalva,
  Mynerve. Clean but needing the repad: Sriracha (no `calt` in the shipped file, despite the listing),
  Tillana, Amita.

Next step is per-script landing tickets (nine-step unit each), starting where one font closes the most:
Neucha or Amatic SC (Cyrillic, and Hebrew for the latter), then Hind Siliguri, Gayathri, Tiro Gurmukhi.

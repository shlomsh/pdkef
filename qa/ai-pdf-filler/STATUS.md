# AI-04 test fixtures: progress

Owner: test-fixture contributor (Claude). Writable area: `qa/ai-pdf-filler/` only.
Base: `codex/ai-pdf-filler` @ 7eb9457. Branch: `claude/dreamy-newton-pcehkb`.

Nothing here depends on the OpenAI connection or the Sign editor integration, and nothing
here claims AI accuracy or a live integration.

## Plan

- [x] Read CLAUDE.md, PRD, integration spike, AI-04
- [x] Layout contract `forms.mjs`: both forms, 17 fields each (text, date, comb, checkbox groups,
      signature line, one office-use field), rects in points, top-left origin
- [x] `generate.mjs` + `lib/`: flat PDF, image-only scan PDF, expected JSON, preview overlays.
      Text drawing is standalone (bidi-js + pdf-lib); nothing imported from `src/`
- [x] Four fixtures: en-flat, en-scan, he-flat, he-scan (deterministic, sha256 in expected JSON)
- [x] `facts/*.json`: facts text, deliberately missing answers, one conflict, one distractor
- [x] Scans verified image-only (generator asserts it, and checked independently)
- [x] Visual inspection, Hebrew crops at 3x (see README "Visual verification")
- [x] `TRIAL-CHECKLIST.md`
- [x] Independent review (fresh subagent, no shared context): no serious defects; all 34 scan
      rects match drawn ink within ~1 px. Addressed: Node >= 22.18 guard, honest I/O comments,
      `alsoAccept` for date/address spellings, an explicitly undecided start date, `loadTruth`
      note in the checklist, README wording. Not done: unit tests for `lib/geometry.mjs`, because
      vitest only collects `src/` and `scripts/` and `vitest.config.js` is outside this folder

## 2026-09-30: lead's requested changes (AI-04 review notes)

- [x] Scope split. The branch is QA-only again against `codex/ai-pdf-filler`: the merge of `main`
      (FONT-09 editor shaping, guidance, backlog) is gone from this PR. FONT-09 itself stays on
      `main`, where it landed separately.
- [x] Generator independent of `src/`: `lib/text.mjs` now uses `bidi-js` + pdf-lib only (no
      `shapeRun`, `drawShapedRun`, `resolveBidiRuns`). Layout, rects and visuals are unchanged;
      `he-scan` is byte-identical to before.
- [x] Scope claims corrected in README and the PR body.
- [x] Checklist separates detection (17 targets) from AI-fillable answers and placement (14 text,
      date and checkbox fields) and manual comb/signature work.
- [x] Text layer: `/ActualText` carries the logical line (checked exactly). pdf.js ignores it and
      reverses correctly drawn RTL brackets on extraction; the pdf.js check sets bracket direction
      aside and says why. The same pdf.js behaviour is behind the `sign.test.js` extraction case the
      review flagged in FONT-09: correct RTL glyphs cannot also extract unmirrored in pdf.js.

PR: https://github.com/shlomsh/pdkef/pull/29

Last updated: 2026-09-30, requested changes addressed; ready for the lead's re-review.

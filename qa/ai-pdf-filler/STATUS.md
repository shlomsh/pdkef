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
      Reuses Sign's `resolveBidiRuns`, `shapedWidth`, `drawShapedRun` read-only; `src/` unchanged
- [x] Four fixtures: en-flat, en-scan, he-flat, he-scan (deterministic, sha256 in expected JSON)
- [x] `facts/*.json`: facts text, deliberately missing answers, one conflict, one distractor
- [x] Scans verified image-only (generator asserts it, and checked independently)
- [x] Visual inspection, Hebrew crops at 3x (see README "Visual verification")
- [x] `TRIAL-CHECKLIST.md`
- [ ] Independent review (fresh subagent), then mark PR ready

## Finding for the team

fontkit's RTL `layout()` reverses glyphs but does not mirror brackets, and `drawShapedRun`
passes RTL runs straight to it. Sign's export very likely draws `(Email)` inside Hebrew as
`)Email(`. The fixtures work around it locally in `lib/text.mjs`; `src/` is not changed here.

Draft PR: https://github.com/shlomsh/pdkef/pull/29

Last updated: all deliverables in; independent review running.

# AI-04 test fixtures: progress

Owner: test-fixture contributor (Claude). Writable area: `qa/ai-pdf-filler/` only.
Base: `codex/ai-pdf-filler` @ 7eb9457. Branch: `claude/dreamy-newton-pcehkb`.

Nothing here depends on the OpenAI connection or the Sign editor integration, and nothing
here claims AI accuracy or a live integration.

## Plan

- [x] Read CLAUDE.md, PRD, integration spike, AI-04
- [x] Chose tooling: `@cantoo/pdf-lib` + `@pdf-lib/fontkit` (vector), `bidi-js` (Hebrew visual
      order), `pdfjs-dist` in Playwright Chromium (rasterise for scans). No new dependencies.
- [x] Layout contract `forms.mjs`: both forms, 17 fields each (text, date, comb, checkbox groups,
      signature line, one office-use field), rects in points, top-left origin
- [ ] `generate.mjs` + `lib/` (in progress, subagent): one layout source -> flat PDF + image-only
      scan PDF + expected-fields JSON + preview overlays. Reuses Sign's `resolveBidiRuns` and
      `drawShapedRun` read-only; no change to `src/`
- [ ] Four fixtures: en-flat, en-scan, he-flat, he-scan (single page, fictional facts)
- [ ] `facts/*.json` + README + checklist (in progress, subagent): synthetic facts with
      deliberately missing answers, one conflict, one distractor
- [ ] Expected fields: label, kind, writable rect (PDF points, normalized top-left, scan pixels)
- [ ] Verify scans are image-only (no text layer, no AcroForm/widgets)
- [ ] Visual inspection of every fixture, especially Hebrew shaping and direction
- [ ] `TRIAL-CHECKLIST.md`

Draft PR: https://github.com/shlomsh/pdkef/pull/29

Last updated: layout contract landed; generator and facts in progress.

# AI-04 test fixtures: progress

Owner: test-fixture contributor (Claude). Writable area: `qa/ai-pdf-filler/` only.
Base: `codex/ai-pdf-filler` @ 7eb9457. Branch: `claude/dreamy-newton-pcehkb`.

Nothing here depends on the OpenAI connection or the Sign editor integration, and nothing
here claims AI accuracy or a live integration.

## Plan

- [x] Read CLAUDE.md, PRD, integration spike, AI-04
- [x] Chose tooling: `@cantoo/pdf-lib` + `@pdf-lib/fontkit` (vector), `bidi-js` (Hebrew visual
      order), `pdfjs-dist` in Playwright Chromium (rasterise for scans). No new dependencies.
- [ ] `generate.mjs`: one layout source -> flat PDF + image-only scan PDF + expected-fields JSON
- [ ] Four fixtures: en-flat, en-scan, he-flat, he-scan (single page, fictional facts)
- [ ] `facts/*.json`: synthetic input facts with deliberately missing answers
- [ ] Expected fields: label, kind, writable rect (PDF points, normalized top-left, scan pixels)
- [ ] Verify scans are image-only (no text layer, no AcroForm/widgets)
- [ ] Visual inspection of every fixture, especially Hebrew shaping and direction
- [ ] `TRIAL-CHECKLIST.md`

Last updated: in progress.

---
id: "FORM-37"
title: "BTL 1500's Wingdings checkboxes miss FORM-31's printed square"
status: "open"
priority: "P2"
epic: "form-detection"
horizon: "next"
depends_on: []
---

# FORM-37 · BTL 1500's Wingdings checkboxes miss FORM-31's printed square

## Why

FORM-36's held-out form, BL/1500 (05.2026), has 95 `❑` checkboxes on pages 2-6, set in
`BCDEEE+Wingdings-Regular`, code 0x71: the same glyph FORM-31 handles in `SYMBOL_FONT_CHECKBOX_SQUARES`
(`src/editor/adapters/pdf/pdfObjects.js`). On BL/211 the detector reports the printed square (7.4pt); here it
reports the glyph's advance by the font's ascent and descent (10.7 x 9.7pt), so every box scores IoU 0.38-0.45
and checkbox recall is 0 on four pages (`baselines.json`, `btl-1500-2026-p2..p6`). The family name parses
(`symbolFontFamily` accepts `Wingdings-Regular`), so the lookup fails later: likely the character code (a
two-byte or re-encoded font after the file passed through pdf-lib) or a path that never reaches the table.
Inferred, not verified.

## Scope and acceptance

- [ ] Find where the square lookup is skipped for this file, verified with the page's own font dictionary.
- [ ] Fix it generally (red test first, from a fixture of the real glyph's encoding), not by a font-name rule.
- [ ] BL/1500 checkbox rows rise; BL/211 and every other row hold. Re-record the changed rows.

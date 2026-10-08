---
id: "FORM-38"
title: "BTL 1500 checkboxes take the item number or a reversed parenthesis as their label"
status: "open"
priority: "P3"
epic: "form-detection"
horizon: "next"
depends_on: ["FORM-37"]
---

# FORM-38 · BTL 1500 checkboxes take the item number or a reversed parenthesis as their label

## Why

Since FORM-37 the detector finds all 93 `❑` checkboxes on BL/1500 (05.2026) pages 2-6, but only 60 get the
right label. Most of the other 33 have a numbered list item (`1. אני חייל משוחרר`) as their label, so the
checkbox takes the number (". 1") instead of the words beside it. Others have text that pdf.js returns with its
parentheses reversed in the RTL text layer (`הכנסה מפנסיה)יש לצרף תלוש פנסיה אחרון(`), which fails the
containment check. Page 3 is the clearest example: 9 right of 19 (`baselines.json`, `btl-1500-2026-p3`). The label
pass lives in `src/editor/adapters/pdf/fieldLabels.js`. The causes above are read from the label dump, not
traced through the code.

## Scope and acceptance

- [ ] Trace both failure shapes through `fieldLabels.js` on BL/1500 page 3.
- [ ] Fix generally (red test first): a bare list number is not a checkbox's label when words follow it on the
      same line, and mirrored parentheses in RTL runs do not break the match.
- [ ] BL/1500 label rates rise; no other row loses a correct label. Re-record the changed rows.

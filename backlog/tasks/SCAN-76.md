---
id: "SCAN-76"
title: "A book page's text sits centred: even margins from its text rows, padded in the paper's own tone"
status: "in_progress"
priority: "P2"
epic: "scan-next"
horizon: "next"
depends_on: ["SCAN-75"]
---

# SCAN-76 · A book page's text sits centred, with even margins

*Opened 2026-11-15.* A photographed book page whose inner side runs close to the spine comes out with its text block
off centre: a thin margin on the spine side and a wide one on the other. Shlomi's phone session of 2026-11-15 shows it
on page 4 (capture `034-takephoto.jpg`, private, not in the repo).

A first try during SCAN-75 (find the ink's bounding box, pad to even margins) changed 38 of 44 outputs, mostly for the
worse: ink is not only text (page-edge shadow, the facing page, figures), and the padding's tone did not match the
paper. It never shipped.

## Outcome

On a book page, the text block sits centred in the output with even side margins, and the added margin matches the
paper. A page that needs nothing comes through unchanged.

## Acceptance

- [ ] The text block is found from text rows (the row reader the flattening already uses), not from all ink, so
      edge shadow, the facing page and figures do not count.
- [ ] Padding is filled with the page's own paper tone, measured from its margins.
- [ ] Scored on the 22 hand-traced book pages (numbers and ids only): no page gets worse, and pages with a spine-side
      squeeze get even margins.
- [ ] A clean, already centred page is unchanged.
- [ ] Unit tests first, on synthetic pages.
- [ ] Checked on a real phone.

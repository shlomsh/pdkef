---
id: "SCAN-48"
title: "A page's text says which way is up, so a sideways page no longer lands upside down"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
depends_on: []
---

# SCAN-48 · Which way is up

*Opened 2026-11-04* from Shlomi's scans: a slip and two scanned book PDFs came out upside down. Measurements only here;
the pages are private and stay off the repo.
**Track: phone photo of a page, and scanned PDF.**

## What was wrong

Text told Scan that a page lay on its side, not which way, so every sideways page got one clockwise quarter turn. One
of the two ways it can lie came out upside down, every time. The same fixed turn sat in `uprightTurns` and in `assess`,
so photos and scanned PDFs both had it. A photo with no corners found was not read at all.

## Built

- `textUp`: each text row, measured from its own straight line, votes by which half of its letters' band holds more
  ink. Printed Hebrew and Latin both carry more ink in the top half. No model and no OCR.
- `pageTurns`: the one place the turn is decided, 0 to 3 clockwise quarters. `uprightTurns` and `assess` both call it,
  and `pdfSheets` redraws a sheet by the turns it asks for.
- Only rows known to run across may vote. A page needs a vote of 0.5 or more the wrong way to be flipped; otherwise it
  keeps what it did before.
- A photo with no corners is read over its whole frame.
- Highlight's check calls any sheet that needs a turn `sideways`.

## Measured

Every page read at Scan's 1000 px size, in all four rotations, through the shipped code:

| pages | tries | right | wrong | kept as before |
|---|---|---|---|---|
| Hebrew forms and a slip, 11 | 44 | 40 | 0 | 4 |
| A full-colour poster, 1 | 4 | 2 | 0 | 2 |
| Four earlier photos | 16 | 12 | 0 | 4 |
| Scanned book, single pages, 16 | 64 | 64 | 0 | 0 |
| Same book, whole spreads, 8 | 32 | 32 | 0 | 0 |
| Second scanned PDF, 3 | 12 | 12 | 0 | 0 |
| Generated Latin pages, 8 | 32 | 26 | 0 | 6 |

- The strongest read the wrong way was -0.31, the poster, whose text is white on colour.
- Generated Courier pages are not read as sideways at all, as before this change. 4 of the 6 kept tries.
- The 0.5 bar and the row limits were chosen on these pages, and no real Latin scan has been read yet.

## Acceptance

- [x] A failing test first: a page stands up from all four rotations; a sideways page with no read keeps one clockwise
  turn; a page with too little text stays as it is.
- [x] Shlomi's second scanned PDF reads the right way on all three pages.
- [ ] Shlomi's slip and book pages come out upright on his phone.
- [ ] A real Latin scan read upright both ways round.

## Phone check, 2026-11-14 (iPhone, Chrome)

Nine pages taken by the live camera, the same bill in five of them (sideways both ways, upside down, upright), through
the shipped code on a production build. The pages are private and stay off the repo; these are the numbers.

- Eight of nine came out upright, four of them sideways or upside down in the photo. One sideways bill came out upside
  down: its text reads 0.60 down after the sideways turn, but its half-turned copy reads 0.26 down too, so
  `readsUpsideDown` leaves it at one turn. The test for SCAN-69 pins the near-identical pair (-0.53, -0.26) to
  "leave it", so the two numbers cannot tell this page from that one and a threshold change is not the fix.
- A landscape envelope (text running down the page, 0.81 sideways) was read as sideways but has no row vote, so it keeps
  the one clockwise turn; checked by eye on the output page only.
- Decided the same day: no "is it upside down?" prompt. The page view's one Rotate became Left and Right, so a page
  the text read gets wrong is one or two taps from upright whichever way it lies (checked on the iPhone, "much much
  better"). A second signal for which half-turn is up stays open here.

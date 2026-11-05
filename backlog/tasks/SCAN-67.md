---
id: "SCAN-67"
title: "A two-page sheet splits by itself when sure, and asks on that page when not"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
depends_on: []
---

# SCAN-67 · Sure splits, unsure asks

*Opened 2026-11-05* from Shlomi on a Hebrew article of four two-page sheets that stayed whole: "if you'd know there are
two columns and where they are just do it automatically. otherwise you need a human assistance in pages you are not
sure if and where the page break is". Measurements only here.

## What is wrong

The spine finder has one answer, split or not. A thin broken line scores 0.32 to 0.56 against its 0.40 bar, because at the
small copy much of the line is no longer darker than 128. A line through a table passes the same bar and cuts the table.

## What changes

The finder reads three ways:

- **Sure:** a line counted at the looser darkness of 190, with clean paper beside it. It splits with no question.
- **Not sure:** a line with print beside it, or a clear gap between two blocks of text with no line. That sheet stays one
  page and asks "One page or two?", with the line placed and a handle at each end so it can lean.
- **Nothing:** left alone.

The search for a slanted line goes from 6 to 10 degrees. A hand-placed line goes through the same per-page read as a
found one: each page gets its own lean, corners and bend.

A PDF with no text has nothing to say which way it reads, so the page order comes from where short lines sit, counted over
the file so far: a paragraph's last line sits against the side it began on.

## Measured

Print beside the line: 12 real two-page sheets 0.2% or less, 14 false candidates (crops of real pages) 10.8% or more.
Turned sheets at the old 6 degree search: all 12 sure up to 3 degrees either way, then falling away from 5. At 10 degrees:
46 of 48 sure, turned 5 and 8 degrees each way. 234 crops of real single pages: none sure, 18 ask, 216 left alone.
Short lines on the four Hebrew sheets: 38 against the right, 7 against the left.

## Done when

- The four sheets split by themselves into pages in reading order, and the old book still does.
- A folded page or a table is never cut without a person saying so.
- A not-sure sheet asks on that page, the line can lean, and "Two pages" gives two straightened pages.
- A remembered scan keeps an unanswered question.

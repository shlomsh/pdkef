# MOBI-10 spike: `cells.mjs`, the combined ink+text heuristic

`cells.mjs` looks for the input regions `formGrid.js`'s comb/checkbox detector deliberately
leaves alone (see its own docstring): free-text fields, date lines and signature boxes drawn as
plain ruled cells rather than combs or checkboxes. It reuses `pageInk.js`'s vector ink
(`collectPageInk`) and `extract.mjs`'s `text-items.json`, and never re-detects combs or
checkboxes — every candidate is skipped if it overlaps a `candidates.pdfjs-layout.json` region.

```
node scripts/spike/mobi-10/cells.mjs --input <pdf> --page 1 \
  --baseline <candidates.pdfjs-layout.json> --text <text-items.json> \
  --out <candidates.combined-heuristic.json>
```

## The rules, as implemented

1. **Rebuild the grid.** Every vertical edge (`pageInk.js`'s `verticals`, plus the side walls of
   any rectangle with real area) and every horizontal rule (`horizontals`, plus rectangle
   top/bottom) are normalized the way `formGrid.js` does it internally for combs — duplicated
   here rather than imported, since `formGrid.js` doesn't export those helpers and this needed a
   general-purpose cell, not a comb-specific one.
2. **Walk adjacent rule/edge pairs only** (not every pair) as row bands and, within each band,
   columns — the same way a table is actually drawn, and the only way the pass stays affordable.
   A cell is kept only when real ink closes all four sides at >=70% coverage (`CLOSED_EDGE_COVERAGE`,
   mirrors `formGrid.js`'s own `CLOSED_EDGE_COVERAGE`). A row band bounded by only its own two
   outer walls (`xs.length < 3`, i.e. no interior division) is dropped: every observed
   instructional/explanatory panel on both forms has exactly that shape (one bordered paragraph,
   no internal rule), while every real labelled-field row sits next to at least one more column.
3. **Classify by what pdf.js text sits inside.** A cell whose own text covers more than 40% of
   its area is explanatory, not fillable, and is dropped. A cell whose own text is a sentence
   (>25 chars) is dropped for the same reason — low area-coverage over several lines is exactly
   the shape of a paragraph in a wide box, not a short label. A cell whose own text is a bare
   1-3-letter Latin run (`q`, `r m`, ...) is dropped: pdf.js decodes Wingdings-style checkbox glyph
   fonts to ASCII letters, and these are checkboxes already covered by the baseline, not words on
   a Hebrew form. What remains must **hug** the right edge or the top edge (RTL forms put a short
   label at one of those two) and leave >=25pt/>=8pt of blank remainder on the other side — a
   caption centered in a wide decorative cell can have low area coverage without leaving any real
   fillable strip, so the hug is required geometrically, not inferred from coverage alone.
4. **Label resolution.** Own text, if kept, is the label. Otherwise the nearest text item sitting
   *above* the cell in the same column (`headerAbove`, <=220pt away, >=50% column overlap) is used —
   this is the common case in both forms: a header row over one wholly blank data row.
5. **Kind.** Own text that is only `/`, `.` or whitespace is a `date`. `חתימ` (the 4-letter root,
   not the dictionary form `חתימה` — Hebrew construct state turns it into `חתימת` as in `חתימת
   העובד/ת`, which does not contain the literal string `חתימה`) in the resolved label makes it a
   `signature`. `תאריך` in the resolved label makes it a `date`. Everything else is `text`,
   upgraded to `table-cell` when the same column (left/right within 1pt) recurs across >=3 row
   bands — a real repeating table, not a one-off labelled field.
6. **Confidence** starts at 0.45 and adds up to 0.25 (fully closed geometry, a resolved label, a
   keyword-matched kind), capped at 0.7 — below the baseline's flat 0.8, and no candidate here
   claimed high confidence in either run (`confidence calibration: >=0.8 precision n/a (n=0)`
   in every `score.mjs` run of this source alone).

## Results

All figures at `--iou 0.5`, from `score.mjs`. "baseline" = `candidates.pdfjs-layout.json` alone;
"combined" = `candidates.combined-heuristic.json` alone; "union" = the two concatenated
(`out/<form>/candidates.union.json`), which is what the ticket's 90%/90% gate is judged on.

### itc101 (139 targets)

| source   | recall | precision |
|----------|-------:|----------:|
| baseline | 53.2%  | 100.0%    |
| combined | 16.5%  | 65.7%     |
| **union**| **69.8%** | **89.0%** |

Per kind (union; checkbox/comb rows are unchanged from baseline — this source never emits them):

| kind      | targets | recall | precision |
|-----------|--------:|-------:|----------:|
| checkbox  | 62 | 58.1%  | 100.0% |
| comb      | 20 | 100.0% | 100.0% |
| date      | 24 | 95.8%  | 75.0%  |
| signature | 3  | 66.7%  | 100.0% |
| text      | 30 | 53.3%  | 40.0%  |

### health (75 targets)

| source   | recall | precision |
|----------|-------:|----------:|
| baseline | 73.3%  | 100.0%    |
| combined | 14.7%  | 40.7%     |
| **union**| **86.7%** | **80.2%** |

Per kind (union):

| kind      | targets | recall | precision |
|-----------|--------:|-------:|----------:|
| comb      | 6  | 66.7%  | 100.0% |
| date      | 2  | 0.0%   | n/a    |
| radio     | 51 | 100.0% | n/a    |
| signature | 1  | 0.0%   | n/a    |
| text      | 15 | 66.7%  | 38.5%  |

**Neither form reaches the ticket's 90%/90% gate on the union.** health is closer (86.7/80.2)
than itc101 (69.8/89.0). This source moved text-kind recall from 0% (baseline detects no text at
all) to 53.3% / 66.7%, and closed the itc101 date/signature gap almost completely (date
75%->95.8%, signature 0%->66.7%) — but it also brought precision down from a clean 100% to 89.0%
and 80.2%, and left `text`-kind precision around 40% in both forms, which is the real cost of
this source: roughly six false table/text candidates for every five it gets right, driven by one
recurring failure class below (explanatory checkbox-row captions) that a coverage/hug heuristic
cannot distinguish from a real field without deeper semantics.

## Failure classes, with examples

**1. Checkbox-row captions with real (but non-fillable) blank margin — the dominant false-positive
class.** A short caption sitting beside a checkbox (`הכנסה אחרת`, `עבודה/קצבה/עסק` on itc101;
similar captions throughout) is in its own atomic grid cell (the checkbox itself is a separate
column, already excluded via baseline overlap), and the padding around the caption inside that
cell is large enough to pass the >=25pt/>=8pt blank-remainder test even though nobody is meant to
write there — it is column padding, not a field. Distinguishing "caption with padding" from
"short label plus a real input area" needs more than geometry plus a hug test; it likely needs
proximity to a checkbox specifically ruled out as a *caption* (not just excluded as its own
overlapping region), or a text-density prior for what a real fillable margin looks like on these
forms. `itc101` false positives `combined-heuristic-0019`-`0022` (`הכנסה אחרת`, `עבודה/קצבה/עסק`,
and two more caption fragments in the `ז. שינויים` section footer) are this class; so are most of
health's 16 false positives — see class 3.

**2. Single-line subtitles and instruction fragments that survive the panel filter.** Rule 2's
`xs.length < 3` drop catches whole bordered instructional panels, but a subtitle line that
happens to sit near incidental ink (an underline tick, a decorative mark) can still present >=3
column boundaries and get read as a row of short "labelled" cells. `itc101`
`combined-heuristic-0000`-`0002` (`1993`, the `ראה הסברים...` cross-reference in braces, and the
section-B heading `א. פרטי המעסיק`) are fragments of one instructional sentence, each in its own
spurious cell. This is a real, unresolved limitation of a text-coverage heuristic applied to prose
that happens to sit inside ruled decoration; it was not worth chasing further inside this
time-box, since the character-length and hug-edge guards already added materially reduced this
class without a clear next cheap win.

**3. Stacked duplicate rows from double-ruled/tick-corner box drawing — the dominant false-positive
class on health specifically.** health draws each field's box using short corner dashes (0.5pt
rects) rather than continuous strokes, and consecutive fields' boundaries land within ~11pt of
each other, so the *gap* between two real rows is itself bounded by leftover tick ink and reads as
a third, spurious row. Inspecting the ink directly (itc101 uses continuous strokes and does not
have this problem) around health's employer-info table: two real rows at points y~=612-601 and
y~=566-555 are separated by *two* extra bands (601-589 and 577-566) that are pure artifact — one of
them even inherits the ID-number comb's teeth as extra column divisions and text belonging to the
unrelated instructional paragraph above. `combined-heuristic-0000`-`0003` and `0007`-`0013` are
this class. A per-row "does this band's pitch match the section's dominant pitch" dedup pass
would likely fix most of it, but was out of scope for this time-box.

**4. Fields with no ink signal at all.** health's `t071`-`t075` (the doctor's date/signature/name/
license-number row) have **zero** ink nearby — no rule, no rect, nothing; `collectPageInk` returns
no horizontals or verticals within 25pt of the target box in any direction. The form draws only
the caption text and leaves the blank area to typographic convention. This is not a tuning
problem: an ink-based detector fundamentally cannot see a field that has no ink. Recovering these
would need a different signal entirely (e.g. inferring a blank run from the whitespace gap between
a caption's baseline and the next line of content, unbounded by any rule) — a materially different
technique, not a parameter change to this one.

**5. Inline "fill in the blank" text within a sentence.** health's `t067`/`t069`
(`אני מטפל קבוע במבקש... בקופת חולים ____`) are blanks drawn as a short underline *inside* a
sentence, not a boxed cell — there is no left/right/top wall at all, only a bottom rule under part
of the text. `buildClosedCells` requires all four sides closed by construction, so these can never
be found by this source; they would need a distinct "blank line following short text, no box"
detector.

**6. Dotted/dashed leader lines read as many small cells instead of one wide field.** health's
`t017` (`כתובת דואר אלקטרוני`, one continuous ~517pt-wide blank line) is drawn as a row of ~14pt
dashes, not a rule. Each gap between dashes is its own atomic grid cell (mostly <15pt, filtered by
`MIN_CELL_WIDTH`, but a few incidental wider gaps ~25-31pt survive as `combined-heuristic-0024`/
`0025` — themselves false positives, since neither covers enough of the true 517pt target for
IoU >= 0.5). Merging dash-run gaps into one field would need a dedicated leader-line pass;
adjacent-only cell construction cannot produce it.

**7. Repeating-table row loss to incidental mid-row ink (minor, itc101 only).** The 13-row
`ילדיי` (children) name column is found for 9 of 13 rows; rows 1 and 3 are each split by an extra,
narrower horizontal rule that doesn't appear in the other 11 rows (visible as a
471.4-461.6/461.6-450.4/450.4-439.7 triple-split around row 1 in the raw ink — two sub-bands,
neither at the target's full ~22pt height, so neither reaches IoU >= 0.5). This reads as a
page-specific printing irregularity rather than a systematic gap.

## What worked without qualification

- `date` classification via a `תאריך` header (`ז. שינויים` section, itc101) and `signature` via
  the `חתימ` root match: **100% precision** on both, once matched.
- The header-lookup mechanism itself (own text absent, nearest same-column text above used as
  label) is what finds the majority of true positives in both forms — every text-kind miss this
  source *does* catch is a "header row, blank data row below" pattern, exactly as anticipated.
- Skipping baseline regions cleanly: **zero** candidates from this source overlap a comb or
  checkbox target in either form (confirmed via the union reports — checkbox/comb per-kind rows
  are byte-identical to the baseline-only run).

## Honest bottom line

This source is a real, positive contribution — union recall roughly doubles itc101's baseline
(53%->70%) and adds 13 points on health (73%->87%), entirely on `text`/`date`/`signature`, which
the baseline cannot touch at all. But it does not clear the 90%/90% gate on either form, and the
precision cost (100%->89% / 100%->80%) is concentrated in one identifiable, not-yet-solved class:
short captions next to checkboxes that have real but non-fillable blank margin. A second iteration
should attack that class specifically (likely via explicit checkbox proximity, not just baseline
overlap) before reaching for the fields this source structurally cannot see at all (classes 4-6
above, which need different signals, not more tuning of this one).

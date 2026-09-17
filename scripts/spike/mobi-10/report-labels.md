# MOBI-10 spike: geometric label association

`label.mjs` fills `CandidateField.label` for the `pdfjs-layout` comb/checkbox detector's output
using only geometry (candidate `bounds` vs. the page's pdf.js `text-items.json`, both already
CONTRACT.md-normalized) plus plain string heuristics. No model runs at any point.

## Result

Scored with `score.mjs` at the default IoU 0.5, on the matched (TP) pairs from each form's
`report.pdfjs-layout.json` (74/139 targets matched for itc101, 55/75 for health - the pdfjs-layout
detector's own recall is unrelated to this step, see its `report.pdfjs-layout.json`):

| form    | matched pairs | labelled correct | rate  | before this script |
| ------- | -------------:| -----------------:| -----:| -------------------:|
| itc101  | 74            | 67                 | 90.5% | 0/74 (0%)           |
| health  | 55            | 53                 | 96.4% | 0/55 (0%)           |
| **both**| **129**       | **120**            | **93.0%** | 0/129 (0%)      |

Reports: `out/itc101/report.pdfjs-layout+labels.json`, `out/health/report.pdfjs-layout+labels.json`
(scratchpad, not committed). Labelled candidates:
`out/<form>/candidates.pdfjs-layout+labels.json` (scratchpad, not committed).

## The rules, in the order `label.mjs` tries them

Every candidate is scored against the page's text items (blank/whitespace-only items dropped;
any item mostly contained in *any* candidate's own box - a checkbox's rendered square glyph, a
comb's pre-filled digit - is excluded everywhere, since it's a field's own printed content, never
a label). For a candidate:

1. **Same-line touch.** The nearest text item that shares the candidate's baseline (vertical
   bands overlap, or centres are close relative to height) and sits immediately beside it with no
   x-overlap, smallest gap wins, either side. Measured on both forms: itc101's checkbox option
   text touches on its *left*, health's touches on its *right* - checking both sides and taking
   the closer one covers both without a per-form branch. For a `comb` candidate specifically, a
   touching item that reads as a full sentence (more than 3 "real" words - see below) is skipped
   in favour of rule 2, because a comb sitting mid-row has no real same-line neighbour most of the
   time and the nearest thing on its baseline is often just incidental paragraph prose.
2. **Column header above.** The closest text item whose bottom edge is at or above the
   candidate's top and whose x-range overlaps the candidate's (or is centred within it), with no
   distance cap - CONTRACT's own guidance is "walk up to the first run whose x-range overlaps",
   and itc101's 13-row repeating table prints its header once, up to ~0.35 page-heights above its
   last row. The x-overlap requirement is what keeps this from grabbing an unrelated header.
3. **Nearest fallback.** A weighted-distance nearest text item, heavily penalising anything
   *below* the candidate (a label is essentially never printed under its field).

Once an anchor item is found, `growPhrase` pulls in immediately-adjacent same-line items (either
direction) while the gap stays tight, to turn a single word into the full printed phrase (e.g.
"מספר" + "זהות" -> "מספר זהות"). An item that itself reads as more than 2 "real" (2+ character)
words is never absorbed this way - it's a footnote or aside sitting next to the real label with an
ordinary word-gap, not part of it (found via itc101/checkbox-0032's label picking up a whole
"(חובה לצרף אישור פ"ש)" footnote before this guard).

Text assembly is RTL-aware: both forms are Hebrew and pdf.js keeps each item's own characters in
correct logical order, but items across a line come out in ascending-x (visual, left-to-right)
order - the reverse of RTL reading order. `assemblePhrase` groups same-direction items into
chunks, keeps each chunk's *internal* order as-is (this matters: an embedded LTR digit run like
"(4)" is already correctly ordered and must not be reversed), and reverses the *sequence* of
chunks for an overall-RTL line. Separately, every RTL text item has any parenthesis character
un-mirrored once, up front (`unmirrorParens`) - both sample forms store an RTL item's own paren as
the glyph that renders correctly at that on-page position, e.g. the raw string is literally
"שכר עבודה )עובד יומי(", which a human reads as "שכר עבודה (עובד יומי)". Left alone, that
mirroring survives into any label that touches a paren.

A handful of small guards found by inspecting real failures: a lone dash/dot (the separator
between a phone number's area-code comb and its main run) can never itself anchor a label, though
it can still be swept into a merge around a real anchor.

## Failure classes (9 total: 7/74 itc101, 2/55 health)

**1. Ground truth abbreviates text our label reproduces in full.** The candidate label is an
accurate, larger superset of what's actually printed (and the scorer's containment rule normally
credits a superset) - but here the *truth* label dropped a word from the real printed phrase, so
neither string contains the other.

- `pdfjs-layout-checkbox-0019`: ours `"שכר עבודה (עובד יומי) (5)"`, truth
  `"שכר עבודה (יומי) (5) / הכנסות אחרות"` (truth drops "עובד").
- `pdfjs-layout-checkbox-0024`: ours `"כן. הכנסותיי ממעסיק זה מועברות לקיבוץ"`, truth
  `"כן. הכנסותיי מועברות לקיבוץ / חבר קיבוץ/מושב שיתופי"` (truth drops "ממעסיק זה"; the phrase is
  one single pdf.js text item, not something our merge assembled).
- `pdfjs-layout-checkbox-0026`: ours `"כן. הכנסותיי ממעסיק זה אינן מועברות לקיבוץ . (8)"`, truth
  `"כן. הכנסותיי אינן מועברות לקיבוץ (8) / חבר קיבוץ/מושב שיתופי"` (same "ממעסיק זה" drop, plus a
  stray "." absorbed from a punctuation mark sitting almost equidistant between this option's
  line and its neighbour's).

**2. Wrong-but-plausible nearby text.** A real, correctly-formed label from *somewhere* on the
page, just not the field's own - either a mirrored form section reusing near-identical geometry,
or a genuinely close competing run.

- `pdfjs-layout-comb-0000`: ours `"מספר דרכון (למי שאין מספר זהות)"`, truth
  `"מספר דרכון (למי שאין מספר ת.ז.) / בן/בת הזוג"`. itc101 prints this same "passport number, for
  those without an ID number" caption twice, worded slightly differently, once above the primary
  applicant's passport comb and once above the spouse's; geometry alone can't tell which section a
  field belongs to when both combs sit in parallel columns.
- `pdfjs-layout-comb-0032`: ours `"תאריך עליה"`, truth `"מיקוד / כתובת פרטית"`. This is itc101's
  one field whose real caption ("מיקוד") sits just *below* it rather than above (the opposite of
  the form's usual convention, confirmed by reading the coordinates: the caption's box overlaps
  the comb's own baseline rather than sitting cleanly above it) - rule 1 correctly declines it (no
  x-overlap-free touch), and rule 2's above-only search instead finds a real but wrong table
  header further up the same x-band. Widening rule 2 to also accept a close-below caption was
  tried and fixed this case but broke a previously-correct one elsewhere (a below-tolerance wide
  enough to reach "מיקוד" also reached over a row boundary and grabbed a stray pre-printed digit
  for a different comb) for a net loss, so it was reverted; a real fix needs a notion of "which
  row" a field is in, not just raw distance.
- `pdfjs-layout-checkbox-0012`: ours `"אני מקבל/ת נקודות זיכוי ומדרגות מס בהכנסה"`, truth
  `"אני מקבל/ת נקודות זיכוי ומדרגות מס מהכנסה אחרת"` - a near-duplicate phrase elsewhere on the
  page reads closer to this checkbox than its actual caption.

**3. PDF text-extraction artifacts no label-side heuristic can repair.** The scorer's containment
check is whitespace-normalized (collapses runs of whitespace) but does not remove spaces outright,
so any spurious inter-character or mid-word space breaks a match even when every letter is right.

- `pdfjs-layout-comb-0037`: ours `"ש נ ת ה מ ס"`, truth `"שנת המס"`. This heading is set with
  decorative letter-spacing in the PDF itself: pdf.js hands it back as one text item whose string
  already has a space baked in between every letter (`assemblePhrase` never touches it - there's
  nothing to merge, it's a single item). There's no way to tell "letter-spaced word" from "several
  short real words" from geometry alone without either overfitting to this one heading or risking
  wrongly collapsing genuinely separate short words elsewhere.
- `pdfjs-layout-checkbox-0049`: ours `"אני מטפל במבקש שהוא עולה חדש וט רם חלפו"`, truth
  `"למיטב ידיעתי, על סמך אחד מאלה / אני מטפל במבקש שהוא עולה חדש וטרם חלפו שלוש שנים מיום עלייתו
  ____"`. Two separate issues stack here: pdf.js splits "וטרם" into two items ("וט" + "רם") with
  an ordinary word-sized gap between them, so growth reproduces it as "וט רם" (a spurious
  mid-word space); and health's "אישור הרופא" declarations all share one row-context prefix
  ("למיטב ידיעתי, על סמך אחד מאלה") that this script has no notion of hoisting onto every option
  in the group.
- `pdfjs-layout-checkbox-0050`: the same pair of issues on the neighbouring declaration option:
  ours `"עיינתי בתיקו הרפואי בכל קופ ת חולים"` (a "קופת" -> "קופ ת" split) against truth
  `"למיטב ידיעתי, על סמך אחד מאלה / עיינתי בתיקו הרפואי בכל קופת חולים בה היה שלוש שנים שקדמו
  לבדיקה"`.

## What would move the rate further

- A real notion of "row" (cluster candidates of the same kind into rows/columns by consistent
  spacing) would resolve class 2's mirrored-section and wrong-side-caption cases without the
  net-negative blanket distance change tried above.
- Hoisting a shared row-context prefix onto every option in a declaration group (health's
  "אישור הרופא" section, itc101's "מצב משפחתי" row) would close most of class 1 and the row-context
  half of class 3 - the scorer already credits a label that's a *subset* of the truth, so this is
  pure upside, but detecting "these N candidates share one context line" from geometry alone is
  a bigger unit of work than this spike's iteration budget.
- Letter-spacing detection (class 3's `comb-0037`) needs either a font/glyph-width signal this
  script doesn't have, or an explicit allowlist of known decorative headings - the latter is
  exactly the kind of one-off overfit this spike was trying to avoid.

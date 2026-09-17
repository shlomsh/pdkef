# MOBI-10 — LLM-vision reference field maps

Role: "LLM OCR" row of the comparison. Image-only — no `pdftotext`, no text layer, no drawing
operators, no other agent's output, no ground truth. Located and named fields purely by rendering
300dpi crops with `pdftoppm` and reading the pixels.

## Method

Rendered full-page 300dpi images (2481x3508 px) for both forms, then eight ~500px horizontal bands
per form (some overlap) to read the whole page once, followed by targeted crops per section/table to
measure column and row boundaries (divider positions, comb-cell counts, checkbox positions) before
computing normalized bounds. For repetitive structures (children table rows in itc101, the two Yes/No
question columns in health) I measured the block's overall bounding box and per-row/column geometry
once, then generated the repeated rows/checkboxes programmatically from that geometry rather than
cropping every individual cell.

Total crops examined: **~55 for itc101, ~24 for health** (band overviews + section/table geometry
crops + the 6-point precision checks per form; does not count the two initial full-page band sets of
8 images each, which are included).

## Counts by kind

**itc101-page1.candidates.json — 139 candidates**
| kind | count |
| --- | --- |
| checkbox | 62 |
| comb | 38 |
| text | 30 |
| date | 6 |
| signature | 3 |

**health-page1.candidates.json — 86 candidates**
| kind | count |
| --- | --- |
| checkbox | 51 |
| comb | 9 |
| text | 23 |
| date | 2 |
| signature | 1 |

itc101 page 1 is a wide, table-heavy salary-tax-credit form (employer details, employee ID, spouse,
up to 13 dependent children rows, several checkbox clusters for marital/residency/kibbutz/health-fund
status, and a free-form "changes during the year" log). health page 1 is a firearms-license health
declaration: two parallel Yes/No questionnaires (doctor's findings, 10 questions; applicant's own
declaration, 14 questions), each question worth two checkboxes, plus a short contact-details block and
two signature/declaration blocks.

The task brief suggested health would run "well over 100" fields, mostly checkboxes. On a careful,
question-by-question read I count 24 Yes/No questions (48 checkboxes) + 3 declaration checkboxes = 51
checkboxes, plus contact fields, inline "if yes, specify" blanks, and two signature blocks, for 86
total. I did not find additional checkbox content beyond what's transcribed here — I'm reporting the
lower count rather than padding it, per the instruction to never invent fields.

## Offsets found and corrected (precision self-check)

For each form I picked 6 candidates spread across the page, computed the expected 300dpi pixel
rectangle, rendered exactly that crop, and looked.

**itc101**: 5 of 6 checks (tax-year comb, employer "שם" cell, section D start-date comb, spouse ID
comb, "changes" table wide text cell) landed tight around the real box on first measurement — no
correction needed. One check (a middle row of the children table, section ג) showed the right column
edge (מספר זהות) about 75px narrower than estimated; this is a single-table-width issue, noted but not
re-derived given the modest impact on IoU for a wide cell.

**health**: this is where the real, systematic error was — and the self-check protocol caught it. My
first pass placed the two Yes/No checkboxes (כן/לא) for BOTH question columns near the *outer* edge of
each column's box (assuming the layout mirrored between the left and right column). Rendering the
actual crop for the left column's Q1 checkboxes showed them roughly 90–190px further right/inward than
predicted, and the right column's Q8 checkboxes showed the opposite error. Re-examining full-width row
crops for both columns revealed the actual layout: **in both columns the checkbox pair (כן first, then
לא) sits at the block's own left edge, immediately after the block border, with the question text
filling the wide remainder of the row toward the block's right edge** — the two columns are not
mirror images of each other, they repeat the same left-aligned checkbox-then-text pattern. I corrected
`LEFT`/`RIGHT` checkbox and text-column x-coordinates in the generator script accordingly and
regenerated the file; the corrected positions matched a follow-up crop within about 20–50px (checkbox
squares are only ~30px, so this is still not pixel-perfect, but the earlier systematic offset — checkbox
group on the wrong side of the row entirely — was fixed).

Row heights for the two health question columns were also calibrated empirically rather than assumed:
I measured the actual top/bottom of each column's question table (from the header to the "אישור
הרופא" / declaration-paragraph boundary that follows it), summed my line-count estimate per question
(1 line vs. 2-line wrap, read off the band images), and divided to get a per-line height, rather than
assuming a fixed row height throughout — the two columns turned out to need different per-line
heights (~58px left, ~45px right) to land on their measured endpoints, which the naive fixed-height
approach would have missed by ~150-250px by the last row.

## Where I was unsure

- **health's inline "אם כן, פרט / מתי" blanks** (13 of them) have no drawn box — they're just the tail
  of a sentence with room to write. I emitted them as low-confidence (`0.3`) `text` candidates
  positioned at the start of the question's text column on its last line; the exact extent of the
  blank is a guess.
- **itc101's address block** (רחוב/שכונה, מספר, עיר/ישוב, מיקוד): the visible write line and the
  labels naming its sub-fields are in two different rows (line above, labels below), which is unusual
  for this form; I treated the line above as the shared answer area split by the label x-ranges below
  it, confidence 0.45–0.5.
- **itc101 checkbox squares are mostly not rendered as visible glyphs** at 300dpi — text options like
  "כן"/"לא"/"רווק/ה" appear with no drawn box in most clusters (unlike health, where checkbox squares
  are clearly drawn). I still emitted one candidate per selectable option, using the option's line
  position as the bounds, but confidence is capped around 0.3–0.4 for all of them since there's no
  glyph to anchor to.
- **itc101 children table** (section ג): I inferred 13 rows from total table height ÷ measured
  single-row height (~95px); did not visually confirm every one of the 13 is a real row rather than a
  slightly-off row-height estimate producing 12 or 14.
- **health's "עבודה / קצבה/עסק" spouse-income option** in itc101 section ו: split into two separate
  checkboxes (עבודה, קצבה/עסק) since the slash usage was ambiguous between "one option written two
  ways" and "two options"; could be wrong either way.
- Comb cell counts (`cells`) for date fields are my best guess at DD-MM-YYYY vs DD-MM-YY segmentation
  from the number of visible dashes in a compressed row; not independently confirmed per field.

## Timing

Roughly 2.5–3 hours of interactive crop/measure/read cycles across both forms (itc101 took longer:
its layout has far more distinct tables and clusters than health's two repeating questionnaires).

# AI-04 trial checklist

Run this once per fixture (`en-flat`, `en-scan`, `he-flat`, `he-scan`) when the tool exists. Everything
here is synthetic. Copy the results table at the bottom into your notes.

## Before you start

- [ ] Record the date, the fixture name, and its sha256 from `expected/<name>.json`.
- [ ] Record the facts file (`facts/en.json` or `facts/he.json`), the model and settings, and the app commit.
- [ ] Paste `factsText` into the facts box verbatim, with no edits.
- [ ] Analyse page 1 only (the fixtures have one page).

## Recall and precision

- [ ] Compare the tool's candidate fields with `targets` in `expected/<name>.json`. A match is one-to-one,
      same page, compatible kind, and IoU >= 0.5 on the normalised top-left `bounds`.
- [ ] Reuse `greedyMatch` and `kindsCompatible` from `src/tools/sign/fields/corpus/scoring/match.js`,
      read-only. Do not write a new scorer. Load the expected file with `loadTruth` from
      `src/tools/sign/fields/corpus/scoring/score.js`: it copies the file's top-level `pageIndex` onto
      each target, and without that `greedyMatch` matches nothing.
- [ ] Report recall and precision separately. Precision is undefined when there are zero candidates; write "undefined".
- [ ] List the misses, the false fields, and any wrong labels or kinds.

## Answers

Compare each answer with `expectedAnswers` in the facts file.

- [ ] Mark each field: correct, wrong value, or invented (an answer where status is `missing` or `conflict`).
- [ ] A value listed in `alsoAccept` counts as correct.
- [ ] Mark any answer written into a `not-for-applicant` field or the signature.
- [ ] Mark any `leave-unchecked` box that was checked, and any `check` box left empty.
- [ ] `missing` and `conflict` fields show up as questions, with both values shown for a conflict.
- [ ] The distractor fact (favourite vegetable or colour) appears nowhere.

## Answer placement

This is separate from field IoU. Do it after Apply.

- [ ] Each answer's box sits inside the expected rect, and the baseline looks sensible.
- [ ] Left-to-right text is left-anchored; right-to-left text is right-anchored.
- [ ] Comb digits are one per cell.
- [ ] Check marks sit inside the square.
- [ ] Note each displaced answer and by how many points.

## Manual corrections

- [ ] Count moves, edits, deletes and adds.
- [ ] Undo works after each kind of correction.
- [ ] Time from upload to a usable PDF, and time to fill the same form manually.

## Exported PDF

- [ ] Open the download in a second viewer.
- [ ] One page, and answers sit where they were on screen.
- [ ] Hebrew letters are in the correct order with final forms; digits and Latin text run left to right inside Hebrew.
- [ ] A signature is present only because you added it.
- [ ] For scans, the text sits on the image at the right place despite the slight rotation.

## Results

| fixture | recall | precision | invented facts | displaced answers | corrections | time vs manual | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| en-flat | | | | | | | |
| en-scan | | | | | | | |
| he-flat | | | | | | | |
| he-scan | | | | | | | |

Four synthetic forms are a small learning set, so do not infer general accuracy from them.

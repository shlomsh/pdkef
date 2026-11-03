# Scan corpus: adding photos

The page-detection corpus lives in `src/tools/scan/lib/edges/real/`: one `<name>.pgm` per photo (gray, 320 px long edge, upright) and one shared `labels.json`. The test `realCorpus.test.ts` scores today's detector on all of them and prints a table.

## Add photos

1. Open `scripts/scan-corpus/label.html` from disk in a browser. Pick one or more photos. For each, click the four page corners (top left, top right, bottom right, bottom left), or press "No page". Tick the conditions that make it hard, type the source, and save. Each save downloads `<name>.pgm`.
2. At the end, press "Download labels.json". Copy its entries into `src/tools/scan/lib/edges/real/labels.json` (the file holds every case, so merge, don't replace) and move the `.pgm` files next to it.
3. Run `npx vitest run src/tools/scan/lib/edges`. A missing label, an unknown condition or a bad corner list fails with the case named. Then update the baseline (below), since the photo count changed on purpose.

Conditions: low-contrast, shadow, glare, dark-print, clutter, lap, curled, partly-out, hand, no-page, plain.

## Consent

Only add photos we took ourselves or have consent for. They are checked in, so anyone who clones the repo can see them. The `source` field says who took the photo and that consent is in place.

## Moving the baseline on purpose

`real/baseline.json` holds the recorded numbers. A change that makes any of them worse fails the test. When the corpus grows, or a detector change is better and you want to keep the gain, run:

```
UPDATE_BASELINE=1 npx vitest run src/tools/scan/lib/edges/realCorpus.test.ts
```

and commit the new `baseline.json` with the change that explains it.

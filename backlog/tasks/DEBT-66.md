---
id: "DEBT-66"
title: "A file chosen before a tool's island hydrates is kept, not dropped"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-66 · A file chosen before a tool's island hydrates is kept, not dropped

*Filed and closed 2026-10-27* from DEBT-64, whose flaky Merge chip test set files before the island
attached its `change` handler. The e2e specs now wait for hydration (`waitForIsland`), which hid this
from the tests but not from people.

## Why

The empty state's file input is server-rendered, so it is real and tappable from first paint. A person
who picks a file while the island's script is still downloading makes the browser fire `change` into a
page with no handler; the file sits in `input.files` and nothing ever reads it. The tool shows an empty
state for ever.

## Measurement

Production build, Chromium at 390x844 with touch, CDP slow 4G (150 ms latency, 1.6 Mbps down) and a 4x
CPU slowdown, three runs per tool. "Tappable" is the picker label on screen with `elementFromPoint` on it;
"hydrated" is the `ssr` attribute leaving the `astro-island`.

| Tool | Input in DOM | Picker tappable | Hydrated | Window |
| --- | --- | --- | --- | --- |
| Merge | 0.93 s | 0.94 to 0.98 s | 3.16 s | 2.2 s |
| Compress | 0.87 s | 0.88 to 0.89 s | 2.45 s | 1.6 s |
| Sign | 1.07 s | 1.09 s | 4.55 s | 3.5 s |

A real touch tap at the moment the picker became tappable opened the file chooser on all three tools
(two runs each), the island still unhydrated. Choosing a file then left it in the input after hydration
(`files.length` 2 on Merge, 1 on Compress and Sign) with the handler never having run, so the tool stayed
empty. A person needs a second or two to pick, so this happens in practice on any phone slow enough to
take 2 s or more to hydrate. Scripts: scratchpad `measure.mjs` (not committed).

## What changed

- `src/shell/prePickedFiles.ts`: `takePrePickedFiles` (copy the list out, then clear, like every change
  handler) and `useAdoptPrePickedFiles`, which once on mount hands those files to the tool.
- `src/shell/BasePdfTool.tsx` calls it with the shell's own `receiveFiles(files, 'pick')`, so all ten
  tools get it, including the replace-confirm and arrival marking a normal pick has. Held back while a
  draft check shows its placeholder (that state hides the empty state by CSS, so nothing is pickable).
- `src/tools/scan/PdfScanTool.tsx`: the "Take a photo" button is the other server-rendered input and uses
  the same hook.
- No inline script, no CSP change; the SEO shell is untouched.

## Acceptance

- [x] The measurement is written down (above).
- [x] `e2e/tool-early-pick.spec.js` delays `/_astro/*.js` by 1.5 s, picks a file into the server-rendered
  input on 11 routes plus Scan's camera input, and expects the empty state to go. Red first: 11 of 11
  failed before the change (Scan's camera input failed with only the shell change). Green after:
  12 tests x 10 = 120 of 120 with `--repeat-each=10 --workers=4`.
- [x] Unit test `src/shell/prePickedFiles.test.tsx` (hydrates real markup that already holds a file).

## Not covered

A file dropped on the page before hydration is not caught: the browser opens the PDF instead of firing
anything the island could read. That needs a different answer (a page-level guard) and has no reports.

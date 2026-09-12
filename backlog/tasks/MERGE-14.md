---
id: "MERGE-14"
title: "After Download, carry the result into Compress, Sign or Split without re-picking it"
status: "open"
priority: "P2"
epic: "merge-tool"
phase: "longer-term"
depends_on: ["MERGE-12"]
legacy_state: "Open"
---

# MERGE-14 · After Download, carry the result into Compress, Sign or Split without re-picking it

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

The merged result is usually a step, not the end: it gets compressed for an upload limit, signed, or
split later. The competitors promote this heavily because it is their retention loop. Ours is on
device and already built for one path: the home page hands a file to a tool through
`draftStore.saveHandoff` and the tool takes it with `takeHandoff` on load.

Under the Download control, a quiet row: "Compress it", "Sign it", "Split it". Each saves the merged
blob as a hand-off for that tool and navigates; the target tool opens with the file loaded and its own
Replace confirmation logic untouched. On `/he/merge/` the links resolve inside the edition where one
exists, as the dock already does.

**Voice.** Three plain verbs, no "you might also like", no counts, no icons competing with Download.

**Acceptance.**

- Each hand-off opens the target tool with the merged file loaded; the merge draft (MERGE-13) is kept
  so Back returns to the same set.
- Unit tests on the hand-off record; one Playwright check for the Compress route.
- Nothing added to the static SEO surface; `test:weight` unchanged.

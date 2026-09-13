---
id: "MERGE-14"
title: "After Download, carry the result into Compress, Sign or Split without re-picking it"
status: "done"
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

## Updates

- 2026-09-13: under Download, two quiet buttons, "Compress it" and "Sign it" (buttons, not links:
  each parks the merged bytes for the other tool and then moves there, an action on the result rather
  than a navigation). "Split it" was in the first cut and came out the same day on Shlomi's read:
  after page-level reorder and skip in the strip, splitting the result is not the next step anyone
  takes. Each saves the merged blob through `saveHandoff` and navigates; the merge draft is kept. Compress and Split take
  the hand-off on mount through the new `useHandoffIntake` (`src/lib/useHandoffIntake.ts`); Sign
  already did through its editor hook, and when Sign holds a draft the island asks first with the
  shared `ConfirmDialog`. Routes come from a `handoffHrefs` prop so a localized page can point inside
  its edition. Unit tests on the hand-off record and the confirmation in `PdfMergeTool.test.tsx`;
  the Compress route in `e2e/merge/merge-handoff.spec.js`. Nothing added to the static surface. Done.
- Direction A (2026-09-13): Compress it and Sign it (and Share when available) are three equal secondary buttons under the Download element in the rail and in the phone bottom sheet, not underlined footnote links.

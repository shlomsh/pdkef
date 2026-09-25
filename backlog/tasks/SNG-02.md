---
id: "SNG-02"
title: "Three mobile sketches for the next-generation Sign; Shlomi picks one and we polish it"
status: "in_progress"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-01"]
---

# SNG-02 · Three mobile sketches for the next-generation Sign; Shlomi picks one and we polish it

Three genuinely different phone directions, drawn on a design canvas. Each one applies the principles in
`docs/sign-next-gen.md` §5:
- the app owns zoom;
- no chrome inside the page;
- ∧ ∨ stepping through the spots found (a count only on a fillable PDF);
- a review of empty fields at the end;
- free placement stays first-class.

Each sketch covers the same moments:
1. open
2. fill a field with the keyboard up
3. next field
4. place a signature
5. move or resize a selected element
6. review what was missed
7. finish

## Progress

- **2026-09-25:** the canvas is https://claude.ai/artifact/2zhdweqZqXLd5LjmpWsGay.
  - Directions A (guided composer), B (top bar, type in place) and C (Fill and Add modes), five moments each.
  - Row D: the undo feedback decision.
  - Row E: each direction on a scan with 0 fields found, added after Shlomi's point that recall will never reach 100%.
- The open decisions that ride on the pick are in `docs/sign-next-gen-guidelines.md` §12.
- **2026-09-25, later:** Shlomi postponed a strong-model step (how a person connects their own model is
  unresolved) and set the short-term bar: a UX that assumes only reasonable precision and recall. Three
  studies found no on-device breakthrough, and measured our detection at 87-100% recall on most typed
  forms, far lower on unusual layouts, and 0 on scans (`docs/sign-next-gen.md` §5.6).
  - Row F, "Tap to write", is the direction built for that, and the recommendation: B's top bar, a tap
    writes anywhere, found spots are quiet marks with "Not a field", no count or field name from a guess,
    and an honest review. Seven frames: open, type in place, a spot we missed, a mark that is not a
    field, review, a scan, and a fillable PDF where a count is a fact.
  - C's question cards wait for the model step (SNG-12).
  - Shlomi's note: the sketches' Employee details form becomes the app's own example form (SNG-10).

## Acceptance

- [ ] Three sketches published, each with the same moments, so they can be compared side by side.
- [ ] Shlomi picks a direction; his notes are recorded here.
- [ ] The chosen sketch is polished until he approves it, then it shapes SNG-03's spike questions.

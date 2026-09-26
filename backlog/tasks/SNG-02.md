---
id: "SNG-02"
title: "Three mobile sketches for the next-generation Sign; Shlomi picks one and we polish it"
status: "retired"
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
- nothing in the UI comes from whole-page detection;
- the finish shows what was added, never what was missed;
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
- **2026-09-25, final:** Shlomi set the premise: "impeccable ux based on raster with user guidance assuming low precision and recall". Even perfect detection cannot tell which blanks are the person's (an employer's section, an optional box), so walks, counts and "you missed" reviews are out, and marks (ticks, crosses, circles, strike-outs) are first-class. Row F and the detection-based paths are superseded; new low-fidelity directions follow.
- **2026-09-25, the direction:** Shlomi picked the mental model and set the interaction rules that follow from it.
  1. The mental model: "allow user to move between elements zooming on those detected, with false positives and false negatives as first class citizens." Hopping between elements, zoomed in, with detection as a suggestion rather than a claim, is the direction that replaces the three-way A/B/C open question.
  2. Move and resize become deliberate: "hiding the move and resize handles until a field has been selected with a direct click. resize and move should be more intentional." A hop no longer shows handles; only a direct tap does.
  3. Pinch stays zoom, always: "switching to multi column and back should be harder to do by mistake, it will allow better zoom by pinching which is the best mental model for mobile users." Read as: pinching out past the whole page switches to a grid of pages, and that switch must be deliberate, so pinch always means zoom.
  4. The document gets the room: "the document should take most of the real estate, we should be extra conscious to unneeded paddings, margins, redundant multilines etc."
  5. The bar follows the moment: "right actions should appear in right context."
  - Full model and its consequences: `docs/sign-next-gen.md` §5 item 6, `docs/sign-next-gen-guidelines.md` §1 and §12.

- **2026-09-26, retired (Shlomi):** the sketches assumed an app-owned zoom and a new surface. The direction became fill mode instead (SNG-15: the production editor, native zoom, the keyboard's own arrows between fields), and the app-owned camera was retired with SNG-16. The rules from the pick that still hold were carried into fill mode: handles only after a direct tap (SNG-04), the document gets the room, and the bar follows the moment (SNG-17's one-row bar and font bottom sheet). No sketch is being polished.

## Acceptance

- [ ] Three sketches published, each with the same moments, so they can be compared side by side.
- [ ] Shlomi picks a direction; his notes are recorded here.
- [ ] The chosen sketch is polished until he approves it, then it shapes SNG-03's spike questions.

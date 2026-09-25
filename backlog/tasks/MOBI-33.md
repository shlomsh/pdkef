---
id: "MOBI-33"
title: "Decide whether Sign gets a review layer for the proposed field map, or stays hints-only"
status: "open"
priority: "P3"
epic: "form-understanding"
phase: "near-term"
depends_on: ["MOBI-11"]
---

# MOBI-33 · Review the proposed field map, or keep hints-only

*Split from MOBI-11 on 2026-09-25.*

## The decision

MOBI-11 set out to show the detector's result as a proposed field map the person reviews
(delete, resize, add, relabel) before filling. What shipped instead (MOBI-11 Step 2) extends
MOBI-03/04's pattern: a faint hint over each detected region while the matching tool is armed, and
a tap near one snaps the ordinary one-shot placement to it. No proposal state, no accept/reject.

A review layer is a materially different UI from anything in the editor today: every tool is
one-shot (`.claude/rules/editor.md`, arming model). It was never weighed against that invariant,
which is why it did not ship. This ticket is that weighing, and it is Shlomi's call:

- **Keep hints-only.** Close this ticket and MOBI-34 as retired; the detector keeps improving under
  the FORM epic and the hints get better with it.
- **Build a review layer.** Then scope it here: where it lives in the arming model, how it looks on
  a phone, and what "tentative" looks like.

## Carried from MOBI-11

- [ ] Each proposal carries its label and kind; a low-confidence proposal is visibly tentative.

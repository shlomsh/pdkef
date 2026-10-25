---
id: "GRID-08"
title: "Compress and Unlock follow the one-file rail rule"
status: "open"
priority: "P2"
epic: "polish"
horizon: "next"
order: 8
depends_on: ["GRID-06"]
---

# GRID-08 · Compress and Unlock follow the one-file rail rule

*Filed 2026-10-25 at Shlomi's request, from his screenshots of /compress/ and /unlock/ the same day.*

## Problem

Both tools keep their controls in a rail to the right of the preview, which is right: the preview is
what a person checks first, and the rail is the commit column that ends in the one action. The order
inside the rail is not what UX guideline 20 now asks of a one-file tool (the choice that defines the
output, then Download and its result, then Share and hand-offs, then Replace file last):

- **The rail opens with the file card and Replace file.** The thumbnail and name repeat what the
  preview shows, and Replace takes the most prominent place although it is the least consequential
  action. The defining choice ("How small" in Compress, the password in Unlock) comes second.
- **Compress states its result three times:** the preview label ("Compressed · 1.29 MB"), the file
  card ("1.3 MB → 1.29 MB") and the Download detail ("1.29 MB").
- **Unlock's Protect PDF is disabled until a password is typed**, drawn as pale text on a pale fill
  with no reason given.
- **They do not use the shared finish language:** Compress has a full-width "Share Compressed PDF"
  where the grid tools have the Share · Compress · Sign row, and labels are title case ("Download
  Compressed PDF", "Set Password") where the grid tools use sentence case.

## Done when

- Each tool's loaded state names its output in a heading above the preview, like the grid tools, and
  its rail runs: the defining choice, then Download with one result line, then Share and the hand-offs
  the tool offers, then Replace file last, with no file card in the rail.
- Compress shows its size result once, on Download (the preview may keep its visual before/after).
- Unlock's primary action is never a disabled, unexplained control: with no password typed it moves
  focus to the field and says what is missing.
- Labels follow sentence case and the voice guide; the Hebrew editions mirror and read naturally.
- Checked side by side with Edit PDF and Split at 1280 and 1440, and on a phone, before handover.

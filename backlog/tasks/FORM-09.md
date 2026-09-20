---
id: "FORM-09"
title: "Ask the person what the form asks, and fill only what they confirm"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "longer-term"
depends_on: ["FORM-02"]
legacy_state: "Open"
---

# FORM-09 · Ask the person what the form asks, and fill only what they confirm

## Why

This is the end state the epic exists for: open a form, understand what it wants, ask for those
things in plain language, and write the confirmed answers into the right places. Every other
ticket here is a prerequisite for it.

It is filed now, and deliberately gated, because the rule that governs it was set by MOBI-10 and
is easy to lose: **below the 90 / 90 / 85 gate there is no automatic question flow.** At 82.0%
recall a form that fills itself is a form that silently misses one field in five, and at 92.7%
precision it is a form that confidently asks about boxes that are not there. A person can review
and fix a field map at those numbers. A flow that asks and writes cannot.

## Scope and acceptance

Do not start this before FORM-01 and FORM-02 land, and re-read the gate numbers when you do.

- [ ] Questions come from FORM-02's canonical types, in the person's language, never from a raw
  printed label pasted into a prompt.
- [ ] **Nothing is written without confirmation.** An answer the person has not seen and approved
  does not reach the PDF.
- [ ] A field whose type is uncertain is asked about differently, or not asked at all and left for
  the person to fill by hand. Tapping and typing stays a first-class path, which is what the tools
  do today and what MOBI-11 was careful to preserve.
- [ ] Answers stay on device, in the one memory space (`src/lib/drafts/draftStore.js`), under the
  same rules as everything else. An identity number is the most sensitive thing this product will
  ever hold; it never leaves, and it is never sent anywhere to be understood.
- [ ] Reuse between forms is the point (the second form should not ask again), and it is also the
  sharpest privacy question in the epic. Decide retention and deletion explicitly, in the ticket,
  before building it.

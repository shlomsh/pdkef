---
id: "DEMO-08"
title: "The hero demo still acts out the v1 field-trip slip: decide whether it should show the practice form people then open"
status: "open"
priority: "P3"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
---

# DEMO-08 · The hero demo still acts out the v1 field-trip slip: decide whether it should show the practice form people then open

*Filed 2026-09-25* while SNG-10 replaced the practice form.

The home page's "try the practice form" sample is now the A4 Personal and employment details form
(SNG-10, `scripts/practice-form-content.mjs`). The hero demo above it still acts out v1's field-trip
permission slip, as its own hand-written, localized copy rather than the PDF:
- `src/i18n/heroDemoMessages.ts` (the Sign story, around line 52: the chat message, file name, trip sentence, checkbox labels, and the long description at line 148);
- `src/components/HeroDemo/storySplit.ts`, `ScrollDriver.tsx` (the `fill-allergies` beat), `HeroDemo.module.css`;
- `.claude/rules/home-page.md` (the story's description).

Nothing is broken: the demo is a story (a parent signing a slip from a class chat), not the sample.
But a visitor who watches it and then taps the sample opens a different form.

## The question for the owner

1. **Keep the story.** A parents' chat and a permission slip is a scene people recognise; the sample
   is a separate thing to practise on. Close this ticket with that decision.
2. **Align it.** Re-cast the Sign story around the employee details form (a new job, the HR form
   arrives in a chat), so the demo and the sample are one form. That rewrites the Sign story's copy
   in every shipped language and its beats, and re-checks the home page's CLS and reveal invariants.

My lean is 1: the story works because the scene is familiar, and the demo never claims to be the sample.

## Acceptance

- [ ] The owner picks 1 or 2; the decision is recorded here.
- [ ] If 2: the story, its localized copy and `home-page.md` describe the new form, and `e2e/home/**` is green.

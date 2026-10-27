---
id: "ARCH-60"
title: "Sign and Redact read tap samples through one function"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-60 · Sign and Redact read tap samples through one function

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Duplication. Structure only: no behaviour change.

## Why

- `readTapSample` is copied between `src/tools/redact/useTapOutsideDeselect.ts:80` and `src/tools/sign/components/PdfWorkspace.tsx:496`, differing only in how `scrollTop` is read. It is iOS touch and zoom code, where drift is costly.

## Outcome

- One `readTapSample(touch, time, scrollTop)` beside `TapGestureSample`, used by both.

## Acceptance

- [x] One definition remains, with a unit test.

## Done (2026-10-27)

One readTapSample(touch, time, scrollTop) beside TapGestureSample in src/lib/gestures/tapOutsideDeselect.ts, with unit tests; Redact, Sign and Sign fill (a third copy) call it with their own scrollTop.

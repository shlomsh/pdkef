---
id: "SIGN-29"
title: "Desktop toolbar wraps Download onto a full-width second row since the Date tool"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-18"
---

# SIGN-29 · Desktop toolbar wraps Download onto a full-width second row since the Date tool

Shlomi, 2026-09-18, on the live /sign/ at a normal laptop width: "what is the deal with the huge new
download button on the sign tool, it takes an entire row on desktop".

It is not a new button. `SignToolbar.module.css`'s desktop block (≥920px) makes wrapping the
fallback when the labelled row does not fit: `flex-wrap: wrap`, `flex-shrink: 0` on every control,
and container queries that drop the low-priority labels (Undo, Full screen, Replace at ≤1160px, the
tool labels at ≤960px) so the row shrinks *before* it has to wrap. Every control is `flex: 1 1 auto`,
so whatever lands alone on a second line grows to fill it. The thresholds were computed from "Sign's
ten labelled controls come to ~1100px". The Date tool (79c2238c, 2026-09-15) added a labelled control
and redid the phone arithmetic only; Share on desktop Chrome adds another. The row is now ~1300px
labelled, so at a toolbar between ~1160px and that figure no label has dropped yet, the row overflows,
and Download becomes a banner. The comment predicted exactly this drift.

## Scope

- Measure the real labelled row widths in a browser (Sign and Redact, with and without Share) at the
  current control set. Record the figures in the CSS comment; the ~1100/~910/~620 numbers are stale.
- Move the label-drop thresholds so every label collapses before the row can overflow, adding a tier
  if two are no longer enough. Priorities stay as documented (Undo/Full screen/Replace first, the
  tool vocabulary last, Download/Share never).
- An e2e guard: at a few desktop container widths across 920px and up, the toolbar renders as one
  line (every control's top equals the first control's top) for both tools. jsdom cannot see rects.

## Acceptance

- No desktop width from 920px up wraps the Sign or Redact toolbar with the current control set.
- The label-priority thresholds in `SignToolbar.module.css` are measured, not inherited, and the
  comment says where each figure came from.
- `check:fast` and the full `ci.yml` chain green.

## Decision 2026-09-18

Three rounds. The first re-measured the two label-drop tiers; that fixed the wrap but made Undo,
Full screen, Feedback and Replace icon-only at every laptop width whenever Share exists, because Sign
fully labelled (~1240px) is wider than the toolbar box ever gets (1172px). The second split the
first tier so Feedback and Replace would keep their words; measured, it bought nothing, since Full
screen has no label on desktop (the view control replaces it) and Undo's label alone is ~36px.

Shlomi's call, after that: stop tuning thresholds. **Two anchors, desktop and iPhone, and a
reasonable step between, for Sign and Redact alike.** From 1300px the row is one line with labels,
and it fits the 1172px plateau (~1138px) because Undo and Feedback are icon-only at every width
(`data-icon-only`; an arrow and a bug are conventions, neither is a tool). Below 1300px every control is
icon-only on one line with its tooltip, until eleven 44px targets stop fitting at a ~660px window;
narrower than that, the phone grid, whose even split now covers that whole band, unchanged in shape. The three
container-query tiers and every `data-label-priority` attribute are gone; the e2e guard checks one
line from 700px to 1600px and the label state at both anchors.

Sign's own toolbar was also reordered to Sign, Text, Date, Symbols, Shapes, Whiteout, Undo,
[view density / full screen], Feedback, Replace, Share, Download: the tool the page is named for
leads (the same reasoning f48fcbd8 already applied to Redact's Blur), Undo sits beside the work it
undoes, the chrome (view, full screen, Feedback) groups together, Replace sits with the other
finishing action, and export stays at the far edge. Redact's own order is unchanged. See
`.claude/rules/editor.md`'s "Main toolbar layout" section for the standing rule.

## CI follow-up 2026-09-18

The first push wrapped at a 1280px window on the Linux runner: the system-font stack lands on a
wide face there (DejaVu, Verdana's width class, ~1177px for the twelve labelled controls against
SF's ~1110px) and a classic 15px scrollbar takes the box to ~1141px. Fix: 6px gaps and .5rem
horizontal padding where labels show (~60px back) and the labelled floor moved to 1300px, so a
wide font still has ~40px to spare with a scrollbar. Lesson for the rule: measure with a wide font
too, not only SF.

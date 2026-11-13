---
id: "SNG-25"
title: "Sign: empty field frames show only while the armed tool can land in them"
status: "done"
priority: "P2"
epic: "sign-fill-mode"
depends_on: []
---

# SNG-25 · Empty field frames show only while the armed tool can land in them

*Filed 2026-11-12 from Shlomi's first-visit read of a filled Google Docs form (a kibbutz work-months
declaration, a table of employers and months).* He opened the file, did nothing, and every empty table
cell carried a tinted frame, header row included. With no tool armed it read as a rendering bug, not a
hint, and his job on that page was only to sign: a signature is an image element that reaches no
detected field (`fillReachTargets`, tool `other`), so none of those frames could help him.

Since SIGN-45 an empty slot already ignores taps with nothing armed, so at rest the frames were only
decoration. They also made the page look like the download might carry grey cells, which it never does.

## The rule

A frame shows only where the armed tool can land, the same set `fillReachTargets` reaches:

| Armed | Empty slot frames | Tick box hints |
| --- | --- | --- |
| nothing | hidden | hidden (a tap still toggles a detected box) |
| Text, Date | shown | hidden |
| Symbols | hidden | shown (already so) |
| Sign, Shapes, Whiteout, Highlight, any other | hidden | hidden |

- **Typing keeps them.** While any fill input has focus, every slot frame shows, whatever is armed.
  Text disarms after one placement, and Enter keeps hopping through fields; the frames must not
  vanish mid-form.
- **Tab with nothing armed** still reaches a slot; since a focused fill input counts as typing, the
  frames show for the keyboard user and nobody else.
- The slots stay mounted at rest, so reading order, Tab and VoiceOver are unchanged. Only the resting
  chrome goes.

## Done when

- `slotFramesShown(tool)` (`src/tools/sign/lib/fill/fillWorkspace.ts`) is true for `text` and `date`
  only, unit-tested first.
- The pages container carries `slots-quiet` when fill mode is on and `slotFramesShown` is false, and
  `fill.module.css` drops the at-rest frame there unless a fill input has focus.
- `docs/sign-fill-mode.md` ("Hints") states the rule.
- Checked in a real browser on the form above: nothing armed shows a clean page; Text shows the frames;
  typing then Enter keeps them; Sign shows none.

Detection's own wrong frames on that form (the header row, label cells) are FORM-40.

## Outcome

Done 2026-11-14. Checked in a real browser (astro dev, one worktree server) on the BTL 1500 form, page 6, a
table-heavy page with 438 fill slots, at 390px wide and at a desktop width. Nothing armed: no tinted frames
(0 of 438 visible). Text: all frames show. Typing then Enter to hop: the frames stay while a field has focus.
Date: frames show. Symbols: frames hidden, tick-box hints shown. Whiteout, Rectangle, Highlight, and Sign
(a signature placed with a typed name): no frames. Tab with nothing armed reaches a field and its frames show
for that keyboard session. Desktop: clean at rest, frames with Text armed. Raw screenshots were kept
in the session scratchpad. The kibbutz work-months declaration itself was not to hand; the BTL table form
stood in for it. Detection's own wrong frames on that page stay with FORM-40.

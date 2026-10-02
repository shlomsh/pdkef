---
id: "RED-53"
title: "Redact's box toolbar is one calm row: blur on a single line, Duplicate labelled, a clear gap above the box"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-53 · Redact's box toolbar is one calm row: blur on a single line, Duplicate labelled, a clear gap above the box

*From Shlomi's review of RED-51's toolbar, 2026-10-02, with desktop screenshots of a blur and a blackout
box, and a sketch he approved ("build all of it").* The blur bar reads as a small form: "Blur strength",
"Lighter" and "Stronger" label one slider, the heading doubles the bar's height, and the slider row sits
about 9px below the buttons beside it. Duplicate (two squares) and Every page (stacked sheets) look like
the same icon, and only Every page has a label. The tick on the slider marks the default but says so only
in a hover tooltip. The bar sits so close to the box that the top-centre resize handle is fiddly.

The same day he found that choosing a colour in the native picker leaves the box unchanged behind it.
RED-51's last fix made the input wait for the picker's `change` (so a pick is one undo step), which
dropped the live preview the `input` events gave. He also asked for the last three colours to be one tap
away.

## Acceptance

- The blur bar is one row, the same height as the blackout and whiteout bars, with every control on one
  centre line. The slider's ends are shown by a small and a large blur mark, not words, and its accessible
  name is still "Blur strength". No default tick.
- Duplicate and Every page have clearly different icons. Where there is room (the desktop pill) both carry
  a text label; on the phone bar they are icon-only with aria-labels and titles, and the whiteout bar stays
  one row at 375, 390 and 402px.
- Blackout, blur and whiteout bars share one right side: Duplicate, Every page, divider, Delete.
- The desktop pill leaves a clear gap above the box, so every top handle can be grabbed.
- While the native picker is open, the box and the swatch follow the colour live; the pick lands as one
  undo step, and it still lands if the box is deselected as the picker closes.
- The whiteout bar offers the last three custom colours (eyedropper or picker, never an automatic
  sample), most recent first, one tap each, remembered across documents.
- Every colour comes from the `:root` tokens, chosen by the palette and the UX guideline.
- Unit tests and the redact e2e cover the new structure; the bar is measured in a real browser at
  desktop width and at 375, 390 and 402px.

## Decisions

- Colours follow the palette's roles (styling.md, editor.md): icons and labels in `--color-text`, hover
  `--color-primary-soft`, the chosen recent colour as a `--color-primary` ring and Auto as a
  `--color-primary-tint` chip (a choice among alternatives), the armed eyedropper as the solid
  `--color-primary` fill (an armed tool), Delete turning `--color-danger` on hover, the blur marks in
  `--color-muted`.
- The pill's inset is its radius minus a control's (`--radius` minus `--radius-sm`, 6px), so every 44px
  tile's corner is concentric with the pill's, and the Auto chip, icons and slider sit as far from the
  pill's ends as from its top and bottom.
- Duplicate is `CopyPlus`, Every page `Layers`. Labels show where there is room (the desktop pill); the
  phone bar is icon-only, as the editor's narrow toolbar already is.
- Blur's ends are a sharp and a soft dot instead of words, the default tick is gone (its string with it),
  and a double-click returns to the default.
- preact/compat turns a JSX `onChange` on range and colour inputs into `input`. Both now commit on the
  real `change` through `useNativeChange`, and `compatInputs.test.tsx` fails if a Redact range or colour
  input ever uses `onChange` again.
- The picker previews by painting the DOM (`paintWhiteoutColor`, like the blur slider's paint), and
  commits once on `change`, on blur, or on unmount if a preview is pending.
- Recent colours are an app-wide list of three in `preferenceStore` (its own record, not the per-document
  style), recorded at deliberate picks only: the box picker, either eyedropper, a recent tap. Never an
  automatic sample, and never the brush's colour menu, which fires on every drag step.
- The desktop pill sits 16px above the box (`BOX_TOOLBAR_GAP`), not the shared 8px.

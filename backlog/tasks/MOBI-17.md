---
id: "MOBI-17"
title: "Tapping a field makes iOS zoom the page, and the floating toolbar is punished twice for it"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MOBI-17 · Tapping a field makes iOS zoom the page, and the floating toolbar is punished twice for it

## What Shlomi saw

Two iPhone screenshots of the same practice form. In the second, taken while typing in a detected
field, the whole page is magnified and the per-element toolbar has gone from two wrapped rows to
three, at about half its former width. "It seems there is some zoom going on to specific field. Not
a bad idea but the toolbar looks like this and it is enlarged out of proportion as well."

## The chain, measured

Every number below is from a real Chromium at a 440x956 phone viewport against a production build,
on the committed form 101 geometry fixture.

1. **The editable is a real `<textarea>`** (`TextNode.tsx:226`), focused programmatically the moment
   a field is tapped (`TextNode.tsx:52-58`, driven by `SET_EDITING_ELEMENT_ID` at
   `useWorkspaceGestures.ts:346`). iOS Safari and Chrome auto-zoom the page when a focused
   `input`/`textarea` computes to under 16 CSS px, by roughly `16 / fontSize`.

2. **Its font size is the PDF's own, scaled to fit the phone.** One multiplication:
   `textFontSize = typography.size(pt) * scaleFactor` (`TextNode.tsx:80`), where
   `scaleFactor = pageWrapperWidthPx / pageWidthPoints` (`coords.ts:327-329`). There is no floor in
   CSS, and the model's floor is `MIN_FONT_SIZE_PT = 6`, which is in *points* and therefore makes
   this worse, not better. Tapping a detected field is the worst case, because `cellFontSize` and
   the comb equivalent only ever shrink the point size to fit the printed cell
   (`combPlacement.ts:253,274-282`).

   Measured: `.page-wrapper` is **358 px** wide inside a 440 px viewport (440, minus `px-4` = 32,
   minus `.tool-card` padding and border = 50). On form 101 a tapped comb field computes to
   **7.22 CSS px**, so iOS zooms by about **2.2x**.

3. **Floating UI's `size()` is coupled to the visual viewport.** `detectOverflow` defaults
   `rootBoundary: 'viewport'` and the call site does not override it (`DraggableWrapper.tsx:131-152`);
   `getViewportRect` reads `visualViewport.width`, which is the *zoomed* width. So the toolbar's cap
   is `min(pageWrapper, visualViewport).width - 16`, and zooming shrinks it.

   Reproduced with CDP `Emulation.setPageScaleFactor`, which is a true visual zoom (layout viewport
   unchanged), on a nine-control text toolbar:

   | page scale | visualViewport width | toolbar `max-width` | rows | height |
   | --- | --- | --- | --- | --- |
   | 1 | 440 | 340 px | 2 | 68 px |
   | 1.8 | 244 | 186 px | 3 | 100 px |
   | 2.22 | 198 | 140 px | 3 | 100 px |
   | 3 | 147 | 89 px | 5 | 164 px |

   The 1.8 row is the second screenshot: nine controls, three rows, about half width.

**So the bar is penalised twice by the same zoom** - magnified on screen *and* forced to wrap more -
which is exactly "enlarged out of proportion". At 3x it is five rows and taller than it is wide.

**Ruled out:** the toolbar's width does *not* depend on where the field sits on the page. Measured
340 px for a field at 11.5% across and 340 px at 75.3%. The reason is in the Floating UI source:
`shift()` sets `enabled.x`, which makes `size()` use the full clipping width instead of the
one-sided distance, so the element's x cancels out. Both `top-start` and `top-end` behave the same,
so RTL is not a mirror case here either.

## The worst case is our own practice form

This is not something only a dense government form provokes. `FileDropzone.tsx:157-162` offers
`public/images/redaction-guide/sample.pdf` in every tool that mounts the shell, Sign included, so
the practice form is the front door: the first document most people open, and one whose every
dimension we chose.

Measured on it, same viewport and build:

- `PAGE_SIZE = [680, 500]` (`practiceFormContent.js:15`) - a custom landscape page, wider than US
  Letter, so it scales *worse*: `358 / 680 = 0.5265` against Letter's 0.585.
- All nine detected fields compute to **6.32 CSS px**, identically. Their printed cells are tall
  enough that the auto-fit never shrinks below `DEFAULT_FONT_SIZE_PT`, so every one of them is
  12 pt x 0.5265.
- iOS zoom on tapping any of them: **16 / 6.32 = 2.53x**.
- At 2.53x the visual viewport is 174 px, the toolbar's cap falls to 116 px, and the bar becomes
  **five rows, 164 CSS px tall - 110% of the visible screen height.**

So on the document we ship to demonstrate the tool, tapping any field produces a floating toolbar
taller than the screen it floats over.

**The trap to avoid:** the page size and the field sizes are ours, so the demo can be made to
behave by enlarging its type or squaring up its page. That would hide the problem exactly where it
is most visible and leave every real form as it is. Worth doing on its own merits - a 680 pt page
is an odd choice that costs 10% of scale against a portrait one - but it is not this ticket's fix
and must not be mistaken for it.

## What to do about it

Shlomi's reading is the right one: zooming to the field is a good idea, and what we have is the
accidental version of it. The factor is `16 / fontSize`, so a *smaller* printed field zooms *more*,
and nothing ever zooms back.

Three moves, and they are not alternatives:

1. **Render the page large enough on a phone that its text is not sub-16px**, and let the document
   pan horizontally. Then iOS never auto-zooms, the chrome stays proportionate and the form is
   legible without pinching. Note before reviving this: "changing the PDF page render width" is
   explicitly declined in `docs/view-density-control-spec.md` section 7 - but that was a desktop
   argument (it leaves gutters on a 1512px screen). On a phone it runs the other way, so this is a
   new decision, not a reversal.
2. **Decouple the chrome from page zoom.** Read `visualViewport.scale`, publish it as a custom
   property, and counter-scale `.actions`. That holds the bar at a constant physical size under
   deliberate pinch as well as auto-zoom. It is also the only one of the three that helps a person
   who zooms on purpose. It needs care: `size()` would still cap the bar against the shrunken
   visual viewport, so the cap has to be divided by the scale too, or `rootBoundary` pinned to the
   page wrapper.
3. **Fewer controls while typing** (MOBI-16). A one-row bar survives a 2x zoom as one row; today's
   nine-control bar becomes three rows.

Not on the table: `maximum-scale=1` or `user-scalable=no` in the viewport meta
(`BaseLayout.astro:39`). It would suppress the auto-zoom, and iOS does still honour it for that, but
it takes pinch away from everyone. The meta deliberately omits both today.

## Acceptance

Tapping a detected field on a phone does not change the apparent size of the editor's own chrome.
Whatever zoom the page ends up at, the floating toolbar holds the same physical size and the same
number of rows. Recorded with the measured numbers above, so a regression is visible as a table
row that no longer matches.

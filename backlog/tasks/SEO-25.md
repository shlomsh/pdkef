---
id: "SEO-25"
title: "A before-and-after preview on Compress, so quality is shown rather than promised"
status: "blocked"
priority: "P3"
epic: "search-acquisition"
phase: "later"
depends_on: ["SEO-05", "SEO-13"]
legacy_state: "Open"
---

# SEO-25 · A before-and-after preview on Compress, so quality is shown rather than promised

## Scope and acceptance

**Deferred deliberately: this is product work wearing an SEO ticket's clothes**, and the copy tickets
that share its subject (SEO-05, SEO-13) are cheaper and land first. Pick it up only once they have and
the standings table shows what they moved.

The research observes that supertool ranks at the top of the quality-focused compression queries partly
on a real side-by-side preview of original against compressed output before download. We already render
pages with pdf.js on both sides of the operation, so the pieces exist.

**Why it is worth more here than it is for a server-side competitor.** Our compressor rasterizes, and
SEO-05 makes the page say so plainly. That honesty costs us the `without losing quality` query. A preview
turns the disclosure into something a visitor can act on: they see what 100KB actually looks like for
*their* document and decide whether to accept it or raise the target. That is a better answer than either
a promise or a warning, and it is the sort of thing only a client-side tool can offer, because the file is
already on the device.

**Constraints.** The gesture golden rule applies to a split-slider: mutate the DOM during the drag, commit
state once on release, and the static check `scripts/check-gesture-golden-rule.js` enforces it. Rendering
two pages at preview resolution costs memory and time on a phone, so it must be opt-in or lazy rather than
part of the default compress flow, and the page-weight budget still applies.

**Acceptance.**

- A visitor can compare the original and the compressed result for at least one page before downloading.
- The comparison does not run by default on mobile unless measurement shows it is affordable there; that
  measurement is recorded.
- Any gesture path routes through `src/editor/`'s controller and passes the golden-rule check.
- `npm run test:weight` and the CSP `build && preview` pass.
- Effect on the compress cluster's CTR recorded in the SEO-02 table at the following refresh.

## Implementation (2026-09-11)

**Picked up ahead of its own gate, on Shlomi's explicit instruction.** This ticket's `depends_on`
(SEO-05, SEO-13) are both `done`, but the second half of the stated gate - "the standings table shows
what they moved" - has not happened yet: that needs the 2026-10-08 refresh (section 1 of the findings
doc), same recrawl exposure SEO-05/SEO-13 are themselves still waiting on. Noted here so review isn't
surprised the gate reads incomplete.

**What shipped.** A before/after reveal slider on `/compress/`, opt-in on every device (a "Compare with
original" toggle inside the results card; nothing renders until it's tapped - see
`PdfCompressTool.tsx`'s `handleToggleCompare`). On open it lazily `import()`s `renderComparePreview`
(new export in `src/lib/thumbnails.js`, 900px page-1 render, `File | Blob` either side) for the original
file and the compressed `Blob` (kept in a ref, not React state - see the comment there), then renders
`CompareSlider.tsx`.

The slider's drag is a real gesture, not a toggle: it reuses `src/editor/gestures/controller.ts`'s
`startGesture` exactly as Sign/Redact's drag/resize do (see `useDraggableElement.js` for the sibling
pattern) - `computePatch` only computes a clamped 0-100 percent from the pointer position, `writeDOM`
writes it straight to the `--reveal` CSS custom property on the container (no Preact state per frame),
and `commit` calls `setPosition` exactly once, on release. Keyboard control (arrows/Home/End) is
supported as a non-gesture, single-commit-per-keypress path, which needs no golden-rule exemption
because there's no continuous pointermove involved. `npm run test:gesture-golden-rule` passes.

**Mobile-cost measurement, not just an assumption.** The panel is lazy on *every* device, which already
satisfies "not by default on mobile" on its own, but "opt-in" is only a real answer if it's still fast
enough once a visitor does tap it. `e2e/compress/compare-preview.spec.js` opens the panel under 4x CPU
throttling (CDP `Emulation.setCPUThrottlingRate`, the same multiplier Lighthouse's mobile preset uses)
at a 390x844 viewport, against a real 4-page fixture PDF: **measured 1.2s** (1178-1206ms across runs)
from tap to both page-1 previews rendered. That's roughly the cost of one extra page-render at the scale
`compressPdf`'s "Recommended" tier already used for every page in the document a moment earlier (see the
comment on `renderComparePreview`), so a device that just finished compressing the whole document can
afford two more page renders on request.

**Verification.** `npm test` (2140 tests, including new `CompareSlider.test.tsx` and an added
`PdfCompressTool.test.tsx` case), `npm run test:css`, `npm run test:weight`, `npm run test:seo`,
`npm run test:csp`, and a manual `build && preview` pass in a real browser (drag confirmed live, network
tab confirmed `thumbnails.js` only loads after the toggle is tapped, no CSP violations, no new
`_vercel`/external network calls) all pass. Full numbers in the session report.

**Left for the next refresh (2026-10-08), per acceptance criterion 5**: CTR effect on the
compress-quality cluster. This needs the same Search Console pull as SEO-05/SEO-13/SEO-04 - see the
findings doc status board row for SEO-25 rather than duplicating the number here once it exists.

## Status 2026-09-11: blocked on the 2026-10-08 refresh

Shipped and indexing requested; nothing left to build. The remaining work is reading the verdict from
the shared Search Console pull the findings doc schedules for **2026-10-08** (section 1 names the
check for this ticket). Marked `blocked` rather than `open` so the board shows only work that can move
today; close it, or reopen it with a finding, from that refresh.

## Image mode (2026-09-12)

Extended the same toggle to the image half of the tool (SEO-19 merged Compress Image into this island;
see `PdfCompressTool.tsx`'s `deriveKind` dispatch). "Compare with original" now renders in image mode
too, sharing the one `comparePreviews`/`CompareSlider` render path with the PDF case rather than a
second copy of it.

**No rasterization, so the PDF section's mobile-cost measurement above does not apply here.** The PDF
path lazily renders page 1 of each side with pdf.js; the image path has nothing to render at all - the
"before" is the original `file` and the "after" is the output blob `compressImageToTarget` already
produced (now also kept in `compressedBlobRef`, which the PDF path alone used to populate), both
already fully decoded bytes on the device by the time a result is on screen. Opening the panel is two
`URL.createObjectURL` calls, not a page-render, so the 4x-CPU-throttled measurement `compare-preview.spec.js`
recorded for the PDF path (about 1.2s) has no image-mode equivalent to report and none was measured;
there is no comparable cost to budget for.

Those two object URLs aren't threaded through the `useObjectUrls` hook `downloadUrl` uses: that hook's
`url` state lands one render after `setBlob` is called, but both sides need to be in `comparePreviews`
together in the same tick so the render stays one shared branch. They're created directly and tracked
in a ref (`compareImageUrlsRef`) purely so they can be revoked the same way `useObjectUrls` revokes the
download URL - on reset (`clearComparePreviews`, called from `resetOutput`), not on every toggle-close
(closing keeps the cached pair, matching the PDF path's own "don't re-render on re-open" behaviour).

**Passthrough decision: hide the toggle, not render it with identical sides.** `compressImageToTarget`
returns the input `File` itself as `blob` when the file was already under target (no re-encode). That
reference equality (`result.blob === file`) is tracked in new state (`imagePassthrough`) and used to
hide the toggle outright for that result - a slider whose "before" and "after" are the same bytes is
noise, not a comparison, and there's nothing to drag toward. A PDF result never hits this path (the PDF
passthrough rule returns a different Blob, not the input File), so this only ever applies to images.

Updated the two "PDF only" comments in `PdfCompressTool.tsx` (`handleToggleCompare`'s doc comment and
the ref/state comments around it) that no longer described what the code does.

**Tests.** One new `PdfCompressTool.test.tsx` case covers: no panel/no `renderComparePreview` call
before the toggle is tapped, two `blob:`-prefixed `<img src>` after tapping with no `renderComparePreview`
call (proving no rasterization ran), and the toggle absent for a passthrough result on a second file.
`e2e/compress/image-target-size.spec.js`'s existing JPEG-to-target test gained a few lines after its
download assertions: open the compare panel, assert the slider is visible with two `blob:` image
sources - a real-browser check that the toggle produces loadable images, not just component state.

**The 2026-10-08 read (acceptance criterion 5, CTR effect on the compress-quality cluster) is
unchanged by this**: it was already scheduled against the PDF-only ship and stays a single read across
both halves of the tool rather than a second one for images.

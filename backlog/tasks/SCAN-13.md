---
id: "SCAN-13"
title: "Scan next: the loaded flow on a phone, rebuilt from the approved screens"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "next"
order: 3
depends_on: ["SCAN-06", "SCAN-08"]
---

# SCAN-13 · The loaded flow on a phone, rebuilt

*Opened 2026-11-04.* Shlomi tried SCAN-08 on the iPhone and rejected the loaded screens: the old workspace was
still there under a new coat (the bar with Take a photo and Download above the page, the strip, Page size,
Size limit and a filled Download under Done, Page size and Clear all sitting with Sign and Redact, no way to
swipe between pages). "Lets go with a rewrite, not a lipstick on a pig."

Below 1024px the island no longer renders `ScanWorkspace`. Two screens are built fresh from the mocks in
[docs/scan-next.md](../../docs/scan-next.md); the engine under them (detection, warp, size search, PDF build)
and the desktop workspace stay.

## Outcome

- **The table** (`ScanPhoneTable`): the name, the numbered grid ending in Add pages (the camera), the hint,
  one card with Size, the limits and Page size, then Share as the one filled button. Under it the quiet next
  steps Download, Sign and Redact. Clear all stands alone at the very bottom. Pages reorder by hold and drag.
- **One page** (`ScanPageViewer`): full screen over everything. The page as it will download, swiped left and
  right through the scan, one row of Corners, Rotate, Look, Retake and Remove, then Done, and nothing under it.
  Corners happens inside the same screen.
- **The camera's stack** opens the same viewer on the last page; Done goes back to the camera, Retake takes
  that page again and goes back to taking pages. The separate Keep or Retake sheet is gone.
- **Gone from phones:** the bar, the page strip, the option blocks, the rail, the filled Download beside Share,
  and the Compress hand-off.
- **Verified** on a production build at 440x956, every screen scrolled to its bottom, then on the iPhone.

## Workers and their definition of done

Every item is checked by the lead against the diff or a running build, not taken from a report. All workers:
failing test seen first, pure logic in `lib/` or `state/`, thin components, strings in `messages.ts`, colors from
tokens, no raised ratchet, no `git stash`, no commit (the lead commits by path), own files only.

### Worker A: the table

Files: `ScanPhoneTable` (new), `ScanPageGrid` (new, shared with desktop), `ScanOutputParts` (new: heading, errors,
Download element), `state/scanOutput.ts` (new, types), `ScanTable`, `ScanWorkspace`, their CSS and tests.

Done when:

1. Top to bottom the screen renders exactly: errors if any, name and page count, grid, hint, card, Share, next
   steps, rating if asked, Clear all. A test asserts this order.
2. The grid's last slot is Add pages, which opens the camera. A quiet Choose photos sits on the hint's row.
3. The card holds Size, Full, 2 MB, 1 MB, 500 KB, the limit note and Page size. Page size opens in the card.
4. Share is the only filled control on the screen: 60px tall, radius 16px, icon and label, disabled until the PDF
   is ready. It calls `flow.handleShare`, and a test proves it.
5. Download, Sign and Redact sit under Share in three equal columns, the same height, content centred.
6. Clear all is the last control in the DOM, alone on its row, and nothing shares that row.
7. A phone that cannot share shows the filled Download in Share's place, with Sign and Redact under it. A held
   back PDF (a failed photo, a failed build) shows the Download element's error there, and its tap goes to the
   failed page.
8. Tiles are `li[data-id]` holding a `div[data-page]` with role button, so hold and drag reorders, and the arrow
   keys move a page.
9. Each tile shows its page on its real paper, by the viewer's placement rule (a pure `tilePaper` in
   `lib/resultView.ts`): on A4 a wide or narrow scan shows its margins, on Fit it fills the paper. Changing Page
   size visibly changes the tiles, and a test proves it. Page size stays in the card, and the viewer gets no
   control for it: it is the whole document's setting.
10. `ScanWorkspace` has no phone code left: no `ScanPhoneBar`, no `phone-options`, no `.phone` or `.wide` block, and
   the dead CSS is deleted. Desktop's rail, table and page view render as before; their tests pass unchanged
   except where they asserted phone blocks.

### Worker B: the page viewer

Files: `ScanPageViewer` (new), `PageActions` (new, shared with desktop's `ScanResultView`), `lib/pageSlides.ts`
(new), `ScanResultView`, `ScanEditorHead`, their CSS and tests.

Done when:

1. A modal `<dialog>` (`showModal`, top layer) covers the whole screen, site header included, and respects the
   safe areas. The body behind it does not scroll.
2. Result mode renders exactly: back, "Page 2 of 3", the page, the not-found line if any, Look's options if open,
   the row of five, Done. Nothing is below Done, and the dialog itself does not scroll at 390x844 or 440x956.
3. Swiping moves between pages with native scroll snap; the title follows; a swipe reaching the next page selects
   it through `onSelect`. No JS drag code.
4. Opening on page N shows page N before first paint, with no visible scroll.
5. Only the current page and its two neighbours load images (`slideWindow`), so a long scan stays light.
6. `slideIndexAt` and `slideWindow` are pure, tested, and correct in RTL (negative `scrollLeft`), at both ends,
   and with one page.
7. Corners mode happens in the same dialog: back, title, hint, the editor, Auto-detect, Whole photo, Use these
   corners. No Rotate, no Full screen, no swiping. Corner drags never scroll anything.
8. Back and Escape in corners act as Use these corners (an unreadable page closes instead). In result mode they
   act as Done.
9. `editor` ref sits on one positioned element present in both modes, and the current slide carries
   `data-current`, so the flatten can land on the right page.
10. `PageActions` is the one row: desktop's `ScanResultView` uses it and its tests pass unchanged.

### Worker C: the camera's stack

Files: `Viewfinder` and its CSS and test, `lib/camera/types.ts`, `state/cameraProps.ts` and its test.

Done when:

1. The Keep or Retake sheet is gone: no `reviewing` state, no sheet CSS, no `onRetakeLast`, no `onFixCorners`.
2. A tap on the stack calls `onReview`, which opens the last page in the viewer (`pageOpened`).
3. `paused` reaches `useCamera`: true while the viewer is over a many-mode camera, false in one mode. Auto never
   fires while paused, and a test proves both values.
4. Escape closes the camera. The shutter, stack, Done, close and Auto behave as before.
5. Retake's taken photo replaces the page and goes through `cameraClosed`, so a `thenMany` retake returns to taking
   pages. A test proves it.

### Lead: integration and proof

Files: `PdfScanTool.tsx`, `useScanView.ts`, `usePhotoTileList.ts`, `messages.ts`, `e2e`.

Done when:

1. Below 1024px the island renders `ScanPhoneTable` and never `ScanWorkspace`. A test proves both widths.
2. The viewer also opens over a many-mode camera at 1024px and up (a large tablet), and never over a one-mode one.
3. Reorder works on the grid and the strip (today `usePhotoTileList` binds once, before either is on screen).
4. Use these corners plays the flatten onto the current page in the viewer.
5. `keepPage` and `fixCorners` are gone from `messages.ts`; `check:fast`, the full unit suite and `check:push` pass.
6. A scripted matrix on a production build at 440x956 and 390x844, each screen screenshotted at scroll top and at
   its bottom: table with 1, 3 and 12 pages; share and no-share; failed page; viewer first, middle, last; swipe
   both ways; Look open; Corners; Rotate; Retake from the table and from the camera; Remove; Clear all; camera
   stack, Done, back to the camera.
7. The list in Outcome is walked against those screenshots, each line ticked or fixed, and a fresh reviewer with no
   shared context has read the diff. Only then does it go back on the iPhone.

## Progress

- 2026-11-04: ticket and screen contract written; reducer events for the camera's review landed first. Shlomi
  asked for a clear definition of done per worker before any implementation; no worker had started.
- 2026-11-04: Page size changes how a page looks, so the tiles draw the real paper (Shlomi's catch). Workers started.

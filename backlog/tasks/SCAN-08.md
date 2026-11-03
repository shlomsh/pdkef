---
id: "SCAN-08"
title: "Scan next: the camera in the page, pages taken by themselves, Share straight after"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "next"
order: 2
depends_on: ["SCAN-04", "SCAN-06", "SCAN-07"]
---

# SCAN-08 · The camera in the page

*Opened 2026-11-03* from the approved flow in [docs/scan-next.md](../../docs/scan-next.md) (sections 1 and 2)
and the mocks (https://claude.ai/artifact/TRgSt9SUjqyXM5NWGkr83L, screens 1 to 5).

## Outcome

- **Start:** on a phone, one large Start scanning with a quiet Choose photos under it.
- **The viewfinder** fills the screen: the live outline (dashed while finding, solid when locked), the hint
  ("Point at a page", "Hold still", "Page 3. Turn the page."), the shutter with its hold ring, the stack with
  its count, Done, close and the Auto switch. Nothing else.
- **Taken:** the existing flatten animation carries the page into the stack.
- **Keep or retake:** the stack opens the last page with Retake and Keep, and a quiet "Fix the corners".
- **Done** goes to the table (SCAN-06), with the PDF already built in the background.
- **Retake** from the one-page view opens the camera for that page only.
- **Fallback:** camera refused or unavailable, today's native "Take a photo" input, same table.
- The still is `ImageCapture.takePhoto` on the running track (SCAN-04: the video still reads clearly worse,
  `takePhoto` as well as a native photo); where `ImageCapture` is missing, the native input after a lock. The
  photo is about 7 MB and its corners take about 1.3 s, so processing runs off the shutter path.
- The browser may ask for the camera on every visit (SCAN-04, Chrome on iOS), so the first screen expects the
  prompt and the refused path is ordinary.
- No frame leaves the tab; the camera stops when the viewfinder closes or the tab hides.

## Acceptance

- [ ] On an iPhone and an Android phone: three pages turned in front of the camera are taken with no tap,
      none twice, then Done, Share, WhatsApp: 6 taps, plus Allow the first time.
- [x] Refusing the camera lands on the native input with no dead end.
- [x] `test:csp`, `test:weight`, `test:lazy-modules` and the precache budget pass; the page's first load
      carries none of the camera code.
- [ ] The `@testSeam` tags SCAN-07 put on `detectPage`, `CONFIDENT`, `sharpness`, `quadArea`, `averageHash`,
      `stepCapture` and `INITIAL_CAPTURE_STATE` are gone, since the camera now imports them.
- [x] One e2e drives the viewfinder with a fake camera stream (Chromium `--use-file-for-fake-video-capture`).

## Progress 2026-11-04 (branch `claude/scan-08-camera`)

Built and checked on a production build; the phone run is open.

- Start scanning leads the empty state on coarse pointers, Choose photos quiet under it (two shell props,
  `actionLeads` and `pickLabel`). Without a secure context, getUserMedia or `ImageCapture` the same label opens
  the native camera, as before hydration.
- The viewfinder (`components/Viewfinder.tsx`, loaded by `ScanCamera` on the first open), the camera hook and
  its worker (`hooks/useCamera.ts`, `lib/camera/`), the frame observation (`lib/capture/observe.ts`), the
  view model (`lib/camera/viewfinderModel.ts`), and the open camera as reducer state (`cameraOpened`,
  `cameraClosed`) with its props from `state/cameraProps.ts`.
- Refused: checked in Chromium with the prompt denied: the line and Take a photo, no dead end.
- `src/tools/scan/e2e/camera.spec.js` drives a drawn page (`fakeCamera.js`, Y4M made at run time): taken with
  no tap, Done, one page on the table. Never taking a page twice stays proven on sequences in
  `captureMachine.test.ts`; the sleep ratchet rules out a timed wait for it.
- Screens checked at 390x844, 375x667, 320x640 and 1440x900: no sideways scroll, no errors.
- A fresh review found eight defects, all fixed: a failed chunk load is retried, no double camera start, a
  failed snapshot keeps the photo, a camera that dies shows the photo fallback, rotation remeasures the video,
  worker errors are reported, auto pauses under the review and Escape closes the review first, no URL leak.
- `@testSeam` tags are gone except `CONFIDENT`'s: the camera reads `confidence`, never the threshold, so only
  its test imports it.
- Not done: focus does not return to Retake after a one-page retake.

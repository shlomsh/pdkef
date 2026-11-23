---
id: "SCAN-78"
title: "Scan: a refused camera photo fails without a word"
status: "in_progress"
priority: "P2"
epic: "scan-next"
horizon: "next"
depends_on: ["SCAN-58"]
needs: "One phone check: tap the shutter, tap Done straight away, is the page in the table?"
---

# SCAN-78 · A refused camera photo fails without a word

*Opened 2026-11-23* from the daily production error read.

## What production shows

- `pdf_tool_run` at step `scan_camera_photo`, DOMException `UnknownError`, reason `no_frame`, cause `other`, on Chromium 157.
- One drop record on each of 15, 19 and 23 November (builds 8ab1366, f816877, 9212e1e). In the same 14 days Chromium 157
  recorded 4 photos as taken. The counts are too thin for a rate, and nothing says whether it was one person or three.
- The browser family does not tell an Android phone from a computer, and the records carry no stack.

## What happens today (read from the code)

`takePhoto` in `src/tools/scan/lib/camera/cameraStream.ts` calls `ImageCapture.takePhoto()`. When it rejects,
`attemptShot` in `src/tools/scan/hooks/useCamera.ts` puts the page back on offer (SCAN-58) and calls `reportError`.
The person sees no message, and there is no retry or other way to get the photo.

## Not known

Why the browser refuses, and whether a second call a moment later succeeds. Settle the second first: it decides whether
a retry is worth having.

## Outcome

- A photo the browser refuses either lands after one retry, if a retry is shown to help, or the person is told
  the photo did not work and offered the phone's own camera.
- The page stays on offer, as SCAN-58 made it, and one failure never becomes a loop of automatic shots.
- `useCamera.test.ts` covers a refused photo, with the new behaviour seen failing first.

## Found, 2026-11-23

- **Closing the camera mid-photo gives production's exact error and loses the page.** Chromium 156, fake camera, built
  page: Done or Close 3 and 10 ms after the shutter gave `UnknownError: platform error` and no page; 400 ms after, the
  page landed. On the iPhone a photo takes 351 to 1126 ms (SCAN-16), and the hint says to turn the page as the shot
  starts. Android Chrome's `StopCaptureTask` closes the device without waiting for a photo.
- Whether that is what the three records were is not known. They are Chromium: iPhone Chrome gets its own engine label.
- Why a camera still running would refuse, and whether a second call works, is still unknown: Chromium's source has
  several paths to this error, and no report of a retry's outcome was found. Not run on an Android phone.
- With every photo refused, auto shot 10 times in 12 seconds and said "Page 1. Turn the page." each time.

## Built, 2026-11-23

- The camera stops once the photo under way has landed, at most 3 seconds later (Done, Close, Escape, page hidden).
  Closing a one-page retake drops its photo and keeps the old page.
- A photo the running camera refuses shows a line and the phone's own camera. Auto waits until a photo lands or Auto is
  turned on again. No automatic retry: the shutter is the retry.
- A photo cut off by the camera stopping reports as `scan_camera_photo_cut`; a refusal keeps `scan_camera_photo`.
- Checked on the built page in Chromium (390, 320 and 844 wide): the page lands after Done, Close and hiding; one
  automatic shot and one message when every photo is refused; the shutter and Auto then take the page.

## Left

- The phone check above. Then read production: `scan_camera_photo` still arriving is a real refusal.

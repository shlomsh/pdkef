---
id: "SCAN-78"
title: "Scan: a refused camera photo fails without a word"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
depends_on: ["SCAN-58"]
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

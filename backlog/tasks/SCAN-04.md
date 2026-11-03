---
id: "SCAN-04"
title: "Scan next: the phone measurements that decide the camera build"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 2
depends_on: []
needs: "Your iPhone, and an Android phone if one is at hand"
---

# SCAN-04 · Phone measurements before the camera is built

*Opened 2026-11-03* with the approved flow in [docs/scan-next.md](../../docs/scan-next.md). The live camera
(SCAN-08) rests on four facts we have only inferred. This ticket measures them on real phones and writes the
numbers here; it builds nothing that ships.

## Measure

1. **Checks per second.** `guessCorners` in a worker on a 240 and a 320 px gray frame from a live video, on the
   iPhone and an Android phone. The Mac reads about 42 ms per check at 320x427 in Node; the camera wants at
   least 5 checks a second.
2. **Still quality.** A page taken as a still from `getUserMedia` video (the highest resolution each phone gives
   a web page, and `ImageCapture.takePhoto` where it exists) against a native photo of the same page: does the
   video still read cleanly after warp, Document look and the 1 MB limit?
3. **Camera permission.** How often iOS Safari and Android Chrome ask again: same visit, next visit, next day,
   added to the home screen.
4. **Share sheet.** Does WhatsApp appear for a PDF shared with Web Share on both phones, and does the chat show
   the file name and size?

A throwaway page on the LAN dev server is enough (LAN http has no `crypto.subtle`, which these checks do not
need; the camera does need a secure context, so use the `localhost` tunnel or https as the dev setup allows).
Nothing from it lands on main.

## Outcome

The four answers, with the phone models and OS versions, written in a Done section here and summarised in
`docs/scan-next.md`. If still quality fails, SCAN-08 takes the photo through the native capture input after a
live lock instead of a video still; that decision is written here too.

## Acceptance

- [ ] All four measured on an iPhone; 1 to 3 also on an Android phone, or written as not measured.
- [ ] The numbers and the still-quality decision are in this ticket and in the design record.

## Progress

**First iPhone run, 2026-11-03.** iOS 26.7.1, Chrome (CriOS 156, WebKit underneath), screen 440x956 at 3x
(a Pro Max size; model not typed in). Measured with the throwaway page on `claude/scan-04-measure`.

1. **Checks per second: passes.** 12.5 checks a second end to end at a 320 px short edge (320x569 frame), in a
   worker. `guessCorners` 42 ms median (p90 44), `detectPage` 16 ms (p90 18), sharpness under 1 ms. The phone
   matches the Mac's Node number, not the 3 to 6 times slower the design record guessed. The 240 px edge was
   not run and is not needed.
2. **Still quality: sizes measured, the visual answer still open.** All three stills are 3024x4032:
   - video still after `applyConstraints` to the track's maximum: 2.2 MB, corners found, `guessPage` 85 ms,
     PDF at the 1 MB limit 277 KB;
   - `ImageCapture.takePhoto` (present on this WebKit): 6.9 MB, corners found, `guessPage` 1341 ms, PDF 379 KB;
   - native photo input: 1.9 MB, corners found, `guessPage` 79 ms, PDF 512 KB.
   All met the 1 MB target at full scale and quality 0.82. Shlomi read them: the video still is clearly worse,
   `takePhoto` and the native photo are both good.
3. **Camera permission: asked on every visit.** On load the state was `prompt`; Start camera asked and the
   stream ran 1.9 s after the tap. After a reload it asked again. Open: Safari itself (Chrome on iOS keeps its
   own permission), next day and the home screen.
4. **Share sheet: WhatsApp is there, twice.** `canShare` is true for a 512 KB PDF. The iOS sheet heads with
   "Scan 3 Nov 2026, PDF Document, 512 KB", offers WhatsApp in the app row, and puts recent WhatsApp chats in
   the people row, so sending to a chat is one tap from Share (screenshot from Shlomi, 23:27). The sheet shows
   the name and size, which Shlomi takes as the answer.

Android: not measured yet.

**Decision: take the still with `ImageCapture.takePhoto`.** The video still loses (point 2), and the native input
would leave the page for every photo, which ends continuous taking. `takePhoto` on the running track keeps the
person in the viewfinder at the native photo's quality. Where `ImageCapture` is missing, the native input after
a lock is the fallback. Its cost: a 6.9 MB photo whose `guessPage` took 1.3 s, so the page is processed off the
shutter path while the next one is taken.

**Also found:** iOS's sheet says 512 KB where our `formatFileSize` says 500 KB for the same file (we divide by
1024, Apple by 1000).

**Left:** the same run in Safari (Shlomi, later). Android: not measured.

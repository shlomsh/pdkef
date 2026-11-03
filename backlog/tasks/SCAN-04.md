---
id: "SCAN-04"
title: "Scan next: the phone measurements that decide the camera build"
status: "open"
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

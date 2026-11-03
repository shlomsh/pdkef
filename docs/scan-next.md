# Scan next: camera to WhatsApp

*Design record, 2026-11-03. The flow was approved by Shlomi the same day from the high-fidelity mocks
(https://claude.ai/artifact/TRgSt9SUjqyXM5NWGkr83L, eight phone screens, clickable in Play). Epic: the
`scan-next` lane, tickets SCAN-04 to SCAN-12. The engine (corners, warp, filters, size search) is unchanged
and described in [scan-to-pdf.md](./scan-to-pdf.md); this record is about the flow around it.*

## The principle

> The camera takes pages, the table fixes them, Share sends them.

Someone scanning wants the paper in their hand to reach someone else. It should feel like turning pages in
front of the camera and pressing Send, not like operating software. Every screen has one job and one button in
focus; everything else waits in a quiet row. Every choice below is checked against it.

**The workflow that matters most:** scan a document with the phone's camera and share it to WhatsApp straight
away. Three pages to a WhatsApp chat take 6 taps in this design (Start scanning, Done, Share, WhatsApp, the
chat, Send), plus one Allow the first time. The same job takes about 16 today.

## What changes from today

Today (SCAN-01, SCAN-02) each page is a round trip to the phone's own camera app (Take a photo, shutter, Use
Photo), then a stop at the corner editor (Use these corners) before the next page. The loaded screen shows
Auto-detect, Whole photo, Rotate, Full screen, Look, Page size, Size limit, Download, Share, Sign, Redact,
Compress, Clear all and the rating ask together, and Download is the main button on a phone.

- **The camera stays open.** A live viewfinder inside the page, not a round trip to the camera app.
- **Pages are taken by themselves.** When the page is steady and sharp it is taken; turn the page for the next.
- **No stop after each photo.** The corners check per photo (Shlomi's 2026-10-26 "review each photo first")
  is reversed on 2026-11-03: the corner editor is unchanged, but it opens when a page is tapped, not after
  every photo.
- **Share is the main button on a phone**, and the size and compression sit right above it.

## The flow

### 1. Start

The first screen on a phone: one large **Start scanning**, with a quiet **Choose photos** under it. Start
scanning opens the camera in the page (the browser asks for the camera once). Choose photos goes straight to
the table. On desktop, Choose photos (and the drop) stay the way in.

### 2. The camera takes pages

- **Finding:** a dashed outline follows the page; the hint says "Point at a page".
- **Hold still:** the outline locks on solid, the hint turns to "Hold still" and a ring fills around the
  shutter.
- **Taken:** the page flattens and flies into the stack in the corner, which counts it ("Page 3. Turn the
  page."). The camera waits until a *different* page is in view before it takes another, so the same page
  is never taken twice.
- **Controls:** the shutter (always works, auto or not), the stack, **Done**, close, and an **Auto** switch.
  Nothing else.
- **Keep or retake:** tapping the stack opens the one-page screen (section 4) on the last page. Done goes back
  to the camera; Retake takes that page again and goes back to taking pages (SCAN-13).
- **The photo** is `ImageCapture.takePhoto` from the running camera, at the native photo's quality without
  leaving the page (SCAN-04: a frame grabbed from the video reads clearly worse).
- **Without the camera:** if permission is refused or the browser has no camera access, today's native
  "Take a photo" input is the fallback, feeding the same table.

### 3. The table fixes them

The loaded state after Done, or after Choose photos.

- **The name** at the top, by date (`Scan 3 Nov 2026`), renamable. WhatsApp shows the file name in the chat,
  so `scan.pdf` is not good enough.
- **The pages** as a grid with their numbers, plus an **Add pages** tile that reopens the camera. "Tap a page
  to fix its corners, turn it or retake it."
- **Size**, the real size of the PDF that will be sent, with **Full · 2 MB · 1 MB · 500 KB** inline under it.
  The size shown is the size sent. The PDF is built in the background while the person scans, so the size is
  there when the table appears.
- **Page size: Fit**, a quiet line inside the same card: it says what the PDF is, like the size.
- **Share**, the one filled button (Download on desktop, where Share is the quiet one).
- The quiet next steps under it: **Download · Sign · Redact**.
- **Clear all**, alone at the very bottom, away from anything that moves the scan forward.

Pages move by hold and drag on the grid.

### 4. One page

Opened by tapping a page on the table. It fills the screen, over the site and everything else, and nothing
sits below Done. It shows the page as it will download, swiping left and right moves through the scan, and
under it one quiet row:

- **Corners** steps into today's corner editor inside the same screen: drag with the loupe, Auto-detect,
  Whole photo, "Use these corners".
- **Rotate** a quarter turn per press. Available, never in focus.
- **Look**: Document, Grayscale, Original for this page.
- **Retake** opens the camera for this page only and puts the new photo in its place.
- **Remove.**

**Done** returns to the table.

### 5. Share sends them

The phone's own share sheet (Web Share with the PDF file): WhatsApp, the chat, Send.

## Page detection

Detection becomes the heart of the tool: it drives the live outline and decides when a page is taken. It
stays one mechanism: the pure `EdgeGuesser` contract in `src/tools/scan/lib/edges/`, strategies swappable,
guarded by a corpus and scored KPIs.

**Baseline (2026-11-03, main at 66718661):** 20 edge tests pass and the corpus finds 18 of 18 with corner
errors of 0.002 to 0.006 of the frame. The corpus is synthetic (flat fills plus noise) with one real photo, so
it is saturated and cannot tell a better detector from a worse one. One `guessCorners` takes about 42 ms on a
320x427 frame on a Mac in Node (brightness 26 ms, outline 16.5 ms), and the same 42 ms on an iPhone (iOS 26,
in a worker at 320x569, 12.5 checks a second end to end with `detectPage`; SCAN-04). It answers found or `null`, with no confidence, and reads gray only.

**The order:**

1. **A real corpus first** (SCAN-05): photos and short videos of real pages in hard conditions, hand-labelled,
   with scored KPIs and a time budget. Everything after is judged on it.
2. **A live-video layer** (SCAN-07) over today's detector: corners smoothed across frames, taken only when
   steady and sharp, a guard against taking a page twice, and a confidence. No new bytes.
3. **Classical upgrades** (SCAN-09): colour edges, evening out shadow and glare, coarse then fine, each change
   gated on the corpus.
4. **A small learned model, evaluated, not adopted blind** (SCAN-10), behind the same contract, only once its
   licence is clear.

## Rules every piece keeps

- No camera frame and no file byte leaves the device. Frames are analysed in the tab and dropped.
- The camera, worker and capture code load only after Start scanning (`test:lazy-modules`, `test:weight`).
- The capture decision is pure logic (frame observations in, "take it" out), tested on recorded sequences.
- Corner drags keep the gesture golden rule (`src/lib/gestures/controller.ts`).
- No new copy says what a page "needs" or that something was "missed"; a bad shot is the person's call.
- The SEO shell stays static; the tool-page video (SCAN-12) is a plain `<video>`, no script.

## Tickets

| Ticket | Outcome |
| --- | --- |
| SCAN-04 | Phone measurements that decide the camera build |
| SCAN-05 | A real detection corpus with scored KPIs |
| SCAN-06 | The table and the one-page view, fed by today's camera input |
| SCAN-07 | The live capture logic: steady, sharp, once per page, with a confidence |
| SCAN-08 | The camera in the page, Share straight from it |
| SCAN-09 | Classical detection upgrades, gated on the corpus |
| SCAN-10 | A learned detector, evaluated behind the same contract |
| SCAN-11 | The page copy and the guide follow the new flow |
| SCAN-12 | A short, very visual video on `/scan-to-pdf/` |

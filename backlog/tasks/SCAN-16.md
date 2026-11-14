---
id: "SCAN-16"
title: "Scan next: the live camera takes the full photo, not a video-sized one"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 1
depends_on: ["SCAN-08"]
---

# SCAN-16 · The live camera takes the full photo

*Opened 2026-11-04.* Shlomi's first real scan on the iPhone came out poor. The three pages in the PDF are 669x875,
692x896 and 594x855 pixels at exactly 200 ppi, so the size limit did not shrink them: the processed pages were
already that small, about 80 dpi on A4.

SCAN-04 raised the track to 4096x3072 before `takePhoto` and got 3024x4032. SCAN-08 shipped the track at 1920 wide,
on the assumption that `takePhoto` gives the full photo whatever the stream size. That was never measured on an
iPhone. The photo size was not logged, so the cause is inferred: a full photo would mean each page filled less than
a third of the frame.

Shlomi added the older phones while this was being built: a phone takes the best photo it can that is still good
enough as a scan. The target is what that phone can do well, not one standard for every phone.

## Outcome

A page taken with the live camera comes from the best photo the phone can take and still run the viewfinder. The
ladder: the largest stream the phone has; if checks fall under 3 a second before the first photo, a 2592x1944 stream;
if that is too slow too, the native camera, one full photo at a time. Phones without `ImageCapture` already use the
native camera. Results hold; the live features give way.

## Acceptance

- [ ] The camera opens at the size SCAN-04 measured (`width` 4096, `height` 3072, ideal).
- [ ] The focus crop covers the same share of the frame at any stream size, so SCAN-14 still reads print.
- [ ] Each page the live camera adds to a scan reports its long edge as a bucket (`scan_camera_photo`), so the size
      is measured. A one-page retake does not report.
- [ ] A phone that cannot keep up steps down once, then hands over to the native camera with its own line of copy.
- [ ] On the iPhone: pages come out at least 1200 px wide from a normal shot, read cleanly, the viewfinder stays
      smooth, and ten pages in a row all land.

## Phone check, 2026-11-14 (iPhone, Chrome)

- Nine live-camera photos, every one 4032x3024 from `takePhoto`, 351 to 1126 ms each (the first is the slow one); the
  pages land at 6.6 to 7.3 MB each.
- The pages came out 961 to 1157 px wide, under the 1200 px this ticket asks for: the phone was held high, so the page
  filled about a quarter of the frame. The sharpness of the output pages is alike (edge variance 3010 to 3428), so the
  blur Shlomi saw on the last page is most likely too few pixels on the paper, not focus. The shutter fires at
  `minArea` 0.2 of the frame; a larger floor, or an earlier "closer" hint, is the lever.
- Not captured: the stream's own size (the camera's `getUserMedia` call did not report), and ten pages in a row.
- Second pass the same day, holding the phone lower: four pages came out 1083 to 1358 px wide, two of them over 1200.

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
- [ ] Every live camera photo reports its long edge as a bucket (`scan_camera_photo`), so the size is measured.
- [ ] A phone that cannot keep up steps down once, then hands over to the native camera with its own line of copy.
- [ ] On the iPhone: pages come out at least 1200 px wide from a normal shot, read cleanly, the viewfinder stays
      smooth, and ten pages in a row all land.

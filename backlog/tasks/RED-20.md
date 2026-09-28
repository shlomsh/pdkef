---
id: "RED-20"
title: "True redaction, images and drawn shapes: paint the box into what it touches, once per shared image"
status: "open"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-18"]
---

# RED-20 · True redaction, images and drawn shapes: paint the box into what it touches, once per shared image

*Built only if RED-18 meets its bar. Design: RED-18's Images and Drawn shapes bullets.*

An image a box touches gets the box painted into its own pixels and is saved in the same place; an image
fully covered is deleted. Straight lines and rectangles are cut exactly; a curve crossing a box becomes a
picture of that shape.

## Blur and solid boxes together (external review, 2026-09-28)

A blur never samples pixels under a Blackout or Whiteout, and a solid box always ends on top, whatever
order the boxes were drawn in. Today's export had a blur overlapping a Blackout paste the original,
blurred, back over it (fixed in `redact.js`'s `flattenPage`: solids, then one snapshot, then blurs, then
solids again). Removal in place must keep the same order when it paints boxes into images and patches.

## The watermark case (Shlomi, 2026-09-28)

A watermark image at the top of every page is usually one image the pages share. It is handled once, so
the file gets smaller. When a box touches an image other pages also show, one quiet line offers "This
image is on 12 pages. Remove it everywhere?" (exact, since it is the same image object). Delete gets the
same "everywhere" offer for an image, which is the right tool for a watermark behind body text.

## Acceptance

- A shared header image covered by a Whiteout on one page, with "everywhere" chosen: no page of the saved
  file still references the image, and every page's other text is unchanged.
- A partly covered photo: pixels under the box are the box's colour in the saved image stream, the rest
  unchanged.
- Saved, reopened in Redact: nothing under the white area; the rest of the page can be found and deleted.

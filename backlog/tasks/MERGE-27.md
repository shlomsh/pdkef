---
id: "MERGE-27"
title: "Explain loading files from Drive where people look for it: a how-to page, the hints, and the Marketplace help link"
status: "open"
priority: "P3"
epic: "polish"
horizon: "now"
depends_on: ["MERGE-25"]
---

# MERGE-27 · Explain loading files from Drive

*Drafted 2026-11-03.* Loading from Drive already works two ways and nobody knows: Drive's Open with
menu (MERGE-25) and, on phones, the system file picker (MERGE-18 Route A). No code is needed, only
words in the right places, in the site voice. No new Google surface, so no invariant change.

## Where the explanation goes

1. **A how-to page, `how-to-open-a-pdf-from-google-drive`** in `src/content/content-pages/`, the same
   shape as the sign-on-iPhone and sign-on-Android pages. Steps: right-click the PDF in Drive, Open
   with, PDkef (desktop and Drive's phone app); or Choose file and pick Drive in the Files or document
   picker. A line that the file goes from Drive to the device and nowhere else, and that it is optional.
   This page is also the Marketplace listing's **Help URL** (listing field currently empty).
2. **The existing cloud-drive hint** (`showCloudDriveHint`, Merge only, shown on phones) widens to every
   tool's empty state on phones, and gains the Open with route on desktop. One line, linked to the
   how-to page.
3. **A FAQ entry** on `/merge/` and `/he/merge/` (already says how via the OS picker) updated to mention
   Open with, and the same entry on the other tools where people bring files from Drive. `test:seo`
   keeps FAQ JSON-LD in step with the page.
4. **The `/drive/` page itself**: its no-state view (someone who landed without a file id) says how to
   start from Drive instead of a dead end, with the how-to link.
5. **Where not**: nothing on the home first screen, no banner, no popup.

## Notes

- Cross-link from the privacy page's Drive section to the how-to page.
- Hebrew: the how-to is `/he/` later if the languages programme says so; not part of this ticket.
- The Marketplace Help URL is set in the Cloud Console by Shlomi once the page is live.

## Acceptance

- The how-to page is live, in the sitemap, with its markdown twin and slash redirect pair
  (`test:seo`, `test:redirects` green), and uses no em dashes and no competitor names.
- The phone hint appears on each tool's empty state, links to the page, and does not move the loaded
  tool's first screen (check at scroll 0).
- `/drive/` without a file id points to the how-to page.

---
id: "MEM-28"
title: "A worker never serves a page whose files neither its cache nor the network has"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# MEM-28 · A worker never serves a page whose files neither its cache nor the network has

*Filed 2026-10-29* from two phone screenshots taken while MEM-27 landed and was reverted.

## Why

- Precache tolerates misses per URL (`precacheUrls` in `public/sw.js`), and MEM-22 rightly refuses a
  file whose bytes are not this build's. When a deploy lands mid-install, the worker activates with its
  pages cached but some of their files missed, and the network now serves the next build, where those
  URLs may not exist. Navigation is cache-first, so the cached page keeps loading without them until the
  next worker takes over.
- Seen 2026-10-29 at 14:32 and 14:39: the revert of MEM-27 went live at about 14:31 while a phone was on
  the MEM-27 build. Merge's file list (rules only in `/shared/PdfMergeTool-0da6a7.css`) and the home page's
  recents (`/shared/HomePageLayout-8c8e30.css`) rendered unstyled; both URLs answered 404. Reproduced by
  serving the MEM-27-shaped build of `/merge/` without that one sheet.
- The same gap applies to any file a page needs: a lazily imported chunk shows as `module_load`. Linked
  stylesheets (MEM-27) add render-blocking files to the list.

## Outcome

- A cached page is served from the cache only when its whole closure (the manifest's `pages[url]`) is
  cached too; otherwise the worker serves something consistent (the network page with the network's
  files, or a page whose closure it holds), never a page that can only half load.

## Acceptance

- [ ] A unit test on the worker's navigation decision: a page with a missed closure file is not served
      from the cache.
- [ ] Checked against the stable `/site/` and `/shared/` names (MEM-25, MEM-26): a network page must not
      pick up the old build's stable-named files from the cache.

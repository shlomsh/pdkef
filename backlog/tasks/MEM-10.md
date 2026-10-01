---
id: "MEM-10"
title: "A shipped fix has no way to reach someone who keeps the app open"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 3
depends_on: []
---

# MEM-10 · A shipped fix has no way to reach someone who keeps the app open

*Filed 2026-09-20*, out of the recent-thumbnail data-loss bug. The fix was deployed and verified
against production within minutes, and the person who reported it still reproduced the bug
afterwards, because they were still running the previous build and had no way to know.

## What happens today

`public/sw.js` serves HTML cache-first and refreshes in the background, and deliberately never calls
`skipWaiting()`: deleting the old build's cache under a live page breaks that page's lazy imports.
Both choices are right on their own and neither is up for reconsideration here.

Together they mean a new build takes over only once **every** tab of the site has closed. A person
who keeps the tab open, or an installed app that is never fully quit, can sit on an old build
indefinitely with nothing telling them so. For an ordinary change that is fine. For a fix to
**silent data loss** it is not: the person most motivated to retry is the one still running the code
that loses their work, and the honest instruction we had to give was "quit the browser entirely,
twice".

## What to build

The standard pattern the no-skipWaiting rule already allows: when the waiting worker signals an
update is ready, surface it quietly and let the person choose, rather than taking the page over.
A line in the shell's existing status vocabulary ("A new version is ready · Reload"), reload on the
click, `skipWaiting` sent to the waiting worker at that moment only, when no editor has unsaved
in-flight work. Never automatic, never a modal, and never mid-export.

Worth deciding in the same ticket: whether a build that fixes data loss should be able to mark
itself as one, so the prompt can be more insistent for that case than for a copy change.

## Decision (2026-10-01)

Shlomi's ruling on updates with several tabs open:

- **The same quiet line in every tab.** When a new service worker is installed and waiting, every
  open tab of the site shows "A new version is ready · Reload" in the shell's existing status
  vocabulary. Never a modal, never automatic.
- **One click updates every tab together.** The clicking tab asks the others over a
  `BroadcastChannel` whether any has an export in flight. If none does, it posts `SKIP_WAITING` to the
  waiting worker. `skipWaiting()` runs only on that message, never on install, so the
  no-skipWaiting invariant holds. On `controllerchange` every tab reloads itself, so no tab is left
  running an old build's lazy imports against a deleted cache, which is the reason `skipWaiting` was
  banned in the first place.
- **An export in flight anywhere holds the update.** The line stays and the reload waits until the
  export finishes. Work in progress survives because drafts live in IndexedDB
  (`src/lib/drafts/draftStore.js`); a pending debounced draft save is flushed before the reload, and
  that is verified, not assumed.
- **Declined for v1: marking a data-loss fix build as "more insistent".** One quiet line in every tab
  already reaches the person, which is what the 2026-09-20 report lacked. Reopen only if a fix fails to
  land again.

Two follow-up calls made while building it, the same day:

- **Placement: just under the app bar, never on it.** Fixed at the top centre it covered the app bar's
  chips (desktop) and the logo (phone). It now sits 8px under the bar, end-aligned with the chips on
  tablet and desktop, centred on a phone.
- **When the holding export finishes, Reload comes back; nothing reloads on its own.** Continuing the
  update automatically would discard a result that Compress, Split, To Image and the others keep only
  in memory until Download. Every tab returns to "A new version is ready · Reload" and the person clicks
  again. A tab in the waiting state re-asks every few seconds, so a holding tab that closed or crashed
  cannot strand it. If the worker refuses (a window that did not answer, such as a frozen tab or one
  from a build before this ticket), the line says to close the other tabs and keeps the button.

- **The line shows only when the update cannot happen silently, and offline stays 100%.** A single
  tab never sees it: the active worker switches builds on that tab's next navigation (a reload, another
  tool, home, a recent file) and answers it with an instant refresh, so the page that loads is already
  the new build. That is also what the 2026-09-20 report needed, since a plain reload never picked up a
  waiting build. The line is for several open tabs, where one tab's navigation cannot switch builds
  under the others; it goes away when the others close. Either path takes over only when the waiting
  build is fully precached and the device is online, because activation deletes the old cache and with
  it any offline coverage the new build lacks (a missed asset, the localized page packs).
- **Dismiss:** a quiet × hides the line in that tab until its next page load. The tab still answers
  and still reloads with the others.
- Not built: reloading a single tab while it is backgrounded. The draftless tools keep loaded work only
  in memory, so it would need each of them to report that work first.

**Final shape, later the same day (supersedes the click and the Reload button above).** Shlomi:
the line appears only when a new build is downloaded and ready but another tab is actively working
and blocking it. With that rule the Reload button had nothing left to do (whenever the line shows, a
click could not succeed), so it is gone:

- **Every update is silent.** On any navigation in any tab (a reload, another tool, home, a recent
  file), the active worker asks the waiting build to take over. The waiting build asks every open tab
  whether it holds work a reload would lose, and takes over only when none does, the build is fully
  precached and the device is online. The navigating tab answers idle (it is leaving its page); the
  others reload themselves on `controllerchange` after flushing their draft saves. The navigating tab
  gets a blank page that loads it again a second later, once the new build is active (Chromium
  activates only after the old worker goes idle; an instant refresh kept it busy).
- **What holds:** an export in flight in any tool, and a file open in a tool without drafts (Compress,
  Split, To Image, Image to PDF, Edit Pages, Unlock/Protect keep their work only in memory until
  Download). Sign, Redact and Merge hold only while exporting, because their work is in drafts. A tab
  that does not answer within 750ms (frozen, or on a build from before this ticket) also holds. So
  does a Sign, Redact or Merge tab whose draft failed to save (no IndexedDB, quota, Merge's size cap).
- **Never stranded:** a build whose install missed a file fetches what is missing the next time it
  is asked online, and a hard-reloaded tab still reloads with the others.
- **The line, only in the other tabs:** "A new version is ready. It loads once you're done in your
  other PDkef tab." when a tab is working, or "...Close your other PDkef tabs to load it." when one does
  not answer. It hides as soon as nothing holds; the next navigation then updates every tab. The quiet
  × still hides it until the next page load.

Acceptance adds a Playwright guard for two tabs: an old build open in both, a new build deployed, one
navigation, both land on the new build with their work intact; and a file open in Compress holding
the update while only the other tab says so.

## Acceptance

- With an old build live in one tab and a newer one deployed, the next navigation lands on the new
  build, with the tab's work intact across the reload.
- Nothing appears when there is no waiting worker.
- The prompt never fires during an export or with an unsaved editor change in flight.
- A Playwright guard covers the appear-and-reload path; the existing service-worker specs keep
  passing, `skipWaiting` still never runs on its own.

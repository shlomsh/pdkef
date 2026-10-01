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

Acceptance adds a Playwright guard for two tabs: an old build open in both, a new build deployed, one
click, both land on the new build with their work intact.

## Acceptance

- With an old build live in one tab and a newer one deployed, the update line appears and reloading
  lands on the new build, with the tab's work intact across the reload.
- Nothing appears when there is no waiting worker.
- The prompt never fires during an export or with an unsaved editor change in flight.
- A Playwright guard covers the appear-and-reload path; the existing service-worker specs keep
  passing, `skipWaiting` still never runs on its own.

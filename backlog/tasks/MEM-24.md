---
id: "MEM-24"
title: "A service worker that cannot install, or never completes its precache, says so"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "next"
depends_on: []
---

# MEM-24 · A service worker that cannot install, or never completes its precache, says so

*Filed 2026-10-27* from the independent review of [MEM-22](MEM-22.md). Related to [MEM-12](MEM-12.md),
which watches for people stuck on an old build from Vercel's logs.

## Why

Since MEM-22 a worker stores a file only with the bytes its build's manifest names, and `/` failing that
check fails the whole install. Production serves `dist/` unchanged (all 147 hashed files matched on
2026-10-27), but anything that rewrites HTML on the way, such as a Vercel preview deployment with the
toolbar injected or a proxy that edits pages, now leaves that visitor with no service worker and no
offline support. Before MEM-22 such a worker installed.

Nothing reports it. The same is true of every other way an install or a precache can fail today: a
manifest from another build, `/` unreachable, or a build that keeps missing files and so never becomes
ready to take over.

## Outcome

- A worker whose install fails, or whose precache stays incomplete after it retries, sends one anonymous
  maintenance report through the existing report path (`api/report`, its allowlist) with a reason code
  and counts only: which check failed (other-build manifest, `/` hash mismatch, `/` unreachable, files
  missed) and how many. No URL beyond the app's own paths, no file data, nothing from the device.
- At most one report per build per device, and it never blocks or delays the install itself.
- Whether a Vercel preview deployment rewrites HTML is measured once and written down here.

## Design (2026-10-28)

The worker records, the page reports. Nothing in the worker sends anything.

- **Reason codes** (closed list): `other_build` (manifest from another build), `manifest_unreadable`
  (manifest status other than 404, network failure or invalid shape), `storage` (a cache write threw),
  `root_unreachable` (`/` failed to load or stalled), `root_mismatch` (`/` is not this build's file),
  `files_missed` (a retry of the precache, `completePrecache`, still missed files).
- **Missed-count bucket** (closed list): `0` for an install failure, else `1`, `2-5`, `6-20`, `21+`.
- **The record.** The worker writes it to Cache Storage in a cache named `maint-sw-v1`, outside the
  `pdkef-` prefix, so no cleanup, build comparison or critical-version check ever sees it. The key is
  `/__maint/sw-install/<BUILD_ID>`, and the body is JSON `{"v":1,"build":"<BUILD_ID>","reason":"<code>","missed":"<bucket>"}`.
  An install failure awaits the write, bounded and with errors swallowed, then fails as before. A
  `files_missed` record is written after the retry and never awaited by anything.
- **The report.** On load, after the registration's idle gate, the page reads `maint-sw-v1`. For each
  record of a build that has no tombstone `/__maint/sw-install-sent/<BUILD_ID>` in the same cache, it
  sends one maintenance event `sw_install` with outcome `failure`, the reason and the bucket, through
  `reportMaintenanceEvent` (re-validated by `parseMaintenanceEvent`), then writes the tombstone. That
  gives at most one report per build per device. It keeps tombstones only for builds that still have a
  record, and at most 5 entries in all.
- **The event** is stored as the field `sw_install|failure|<reason>|<bucket>|<engine>`, so the daily read
  shows it as its own row with no script change.

## Acceptance

- [ ] Unit tests in `scripts/sw.test.mjs` for each reason code, the once-per-build limit, and a report
      that fails to send without affecting the install.
- [ ] `src/site-lib/reportContract.test.ts` (or its successor) accepts the new report and nothing wider.
- [ ] The daily error read can tell these reports apart.

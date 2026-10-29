---
id: "MEM-29"
title: "A critical build that cannot install releases the older build's worker"
status: "in_progress"
priority: "P1"
horizon: "now"
epic: "robustness"
depends_on: ["MEM-28"]
---

# MEM-29 · A critical build that cannot install releases the older build's worker

*Filed 2026-10-29* from phone screenshots at 22:23 and 22:26, after MEM-28 and the CRITICAL_VERSION 11 bump.

## Why

- The installed iPhone app (Chrome) still showed unstyled tool islands on `/`, `/sign/` and `/compress/`,
  with the page shell styled. Its About page read `Build 2e83e565bacf`, a build older than the last day of
  deploys, from before MEM-26 renamed every CSS Module class. Closing the app changed nothing.
- pdkef.com was consistent: all 186 manifest hashes matched the live bytes, ETags are content MD5s, and a
  clean WebKit iPhone load had every class ruled. Telemetry for the day: `sw_install failure root_mismatch 0`
  5 times on ios-26 and 2 on ios-chrome-18+, which is `/` failing its hash. That reason only comes from `/`.
- A failed install leaves the active worker in charge, and its navigation is cache-first. So every later
  fix, MEM-28 and the CRITICAL_VERSION bump included, needs the very install that keeps failing. The old
  page then loads the network's stable-named `/site/` JS, whose new class names its old inline CSS lacks.
- Why `/` misses its hash on that phone is not known. It does not vary by language or user agent from
  here, and a deploy race would clear on the next attempt.

## Outcome

- A file whose bytes miss its hash is fetched once more with `cache: 'reload'` before the install calls it
  another build's.
- When `/` still misses its hash (`root_mismatch`) and this build is critical over a build on the device,
  the worker unregisters the registration. Open pages keep their worker until they close; the next load
  comes from the network and installs afresh. Saved work in IndexedDB is untouched.
- Every other failure keeps the older build: offline (`root_unreachable`, `manifest_unreadable`) it is what
  opens the app, another deploy (`other_build`) brings its own worker, a full disk (`storage`) frees nothing.

## Acceptance

- [x] Unit tests, seen red first: the retry past the HTTP cache, the release on a critical root_mismatch,
      none offline, on a failed retry, on other_build, on storage, on a first install or over the same
      critical version, and an install that does not wait on the unregister.
- [x] A real-browser run of the stuck phone: an old build's worker installed, then a build whose `/` never
      matches for the worker.
- [x] The phone shows the live build after one launch past the deploy (`faa72fb2389a`, 2026-10-29).

## Progress (2026-10-29)

- `releaseOlderBuild` and the retry in `precacheUrls`, `public/sw.js`. 10 cases in `scripts/sw.test.mjs`
  ("a failed install of a critical build", source and minified); 269 pass.
- **A fresh-context review** found the first version also released on `other_build` and `storage`, and
  that a first install and a failed retry had no test. The release is now `root_mismatch` only; those cases
  were added, the `other_build` and `storage` ones seen red.
- **The unregister is never awaited.** The first version awaited it inside install and WebKit held the
  install in `installing` for good: the unregister job queues behind the install job. The test with a
  never-settling unregister was red on that version.
- **WebKit, stuck-phone scenario** (scratch server on one origin, swapping builds): an old c10 build's
  worker installed complete, then a c11 build whose `/` answers other bytes to the worker. Current main
  stays on the old Build for good. With this change the next load is uncontrolled and from the network:
  `/about/` shows the new Build and `/sign/` has its 52 module classes ruled. An IndexedDB record written
  under the old worker reads back afterwards.
- **CI on 89a665de failed two critical-build specs** (`e2e/offline/app-update.spec.js`, run 40954007489).
  `twoBuildServer.js` fakes a critical deploy by raising the minified worker's one `isCriticalOver(<N>,`
  call, and the release added a second, earlier one: the fake bumped it and left the forced takeover at the
  old version. Both now go through `criticalOverDevice()`, and the minified-source test pins one call site
  (seen red with two). `check:e2e` (the full product suite, a `public/sw.js` diff) passes locally.
- **Live**: pdkef.com served build `faa72fb2389a` and the phone reported the same build after the deploy.

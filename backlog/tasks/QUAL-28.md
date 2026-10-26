---
id: "QUAL-28"
title: "Move e2e-webkit back to ubuntu-latest once Playwright's WebKit runs on Ubuntu 26.04"
status: "blocked"
priority: "P3"
epic: "robustness"
depends_on: []
waiting_on: "A Playwright release whose WebKit starts on Ubuntu 26.04"
---

# QUAL-28 · Move e2e-webkit back to ubuntu-latest once Playwright's WebKit runs on Ubuntu 26.04

*Filed 2026-10-25.*

## What happened

GitHub moved `ubuntu-latest` to Ubuntu 26.04 from 2026-10-19. CI run 40203805114 (f32046a8) was the
first `e2e-webkit` job on the new image (`Image: ubuntu-26.04`), and every WebKit test failed within a
few milliseconds at launch:

```
MiniBrowser: error while loading shared libraries: libicudata.so.74: cannot open shared object file
```

Playwright `^1.64.1`'s WebKit build (`webkit-2370`) links against Ubuntu 24.04's ICU, and
`playwright install --with-deps` does not supply it on 26.04. The Chromium jobs ran green on the same
image, and the job was green on 5bf08dfb two runs earlier, so the change was the runner, not the code.

The job is pinned to `runs-on: ubuntu-24.04` in `.github/workflows/ci.yml` until this closes. Every
other job stays on `ubuntu-latest`.

## Done when

- A Playwright release lists Ubuntu 26.04 as supported for WebKit, and the repo is on it.
- `e2e-webkit` is back on `ubuntu-latest` (pin and its comment removed) and a CI run on main shows that
  job green on `Image: ubuntu-26.04`.

## Note (2026-10-26)

QUAL-29 moves `e2e-webkit` into Playwright's own Ubuntu 24.04 image, so WebKit no longer depends on the
runner's Ubuntu. Once that runs green on main, the `ubuntu-24.04` pin can go back to `ubuntu-latest`
without waiting for a Playwright release, and this ticket can close on that run.

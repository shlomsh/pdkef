---
id: "SIGN-17"
title: "Fix CI-red tests from in-flight SIGN-04/SIGN-09 direction work"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-08-29"
---

# SIGN-17 · Fix CI-red tests from in-flight SIGN-04/SIGN-09 direction work

## Scope and acceptance

**Fix CI-red tests from in-flight SIGN-04/SIGN-09 direction work.** All five assertions were reconciled with reviewed behavior rather than removed or tolerance-widened. Confirmed closed by CI run [33242665616](https://github.com/shlomsh/pdkef/actions/runs/33242665616) on `b4ffd96`: the `Run tests` step passes 1,803/1,803, as do typecheck, build, and every static guard. That run is still red overall, but on Playwright only, and on failures unrelated to these five - see SIGN-18 and SIGN-19.

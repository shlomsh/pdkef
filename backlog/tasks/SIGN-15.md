---
id: "SIGN-15"
title: "Bound document/render/gesture lifecycles"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "longer-term"
depends_on: []
legacy_state: "Done 2026-09-02"
---

# SIGN-15 · Bound document/render/gesture lifecycles

## Scope and acceptance

**Bound document/render/gesture lifecycles.** Completed 2026-09-02. The shared PDF loader now owns and tears down superseded loading tasks and documents; both editors cancel the active owner on unmount, and page canvases cancel in-flight render tasks during replacement/unmount. Gesture handling now treats touch cancellation, window blur, hidden tabs, and component teardown as aborts rather than commits, reverting each gesture's imperative preview. Replacements and unmounts are covered by focused loader/controller regressions. Page virtualization and indexed element lookup remain deliberately deferred: no large Chrome document measurement has shown that the current direct page/element mapping needs either optimization.

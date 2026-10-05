---
id: "DEBT-40"
title: "Move to preact 11 once @astrojs/preact supports it"
status: "blocked"
priority: "P3"
epic: "robustness"
depends_on: []
waiting_on: "@astrojs/preact peer range admits preact 11"
---

# DEBT-40 · Move to preact 11 once @astrojs/preact supports it

*Filed 2026-10-05.* Dependabot PR #33 (preact 10.29.8 to 11.0.0) failed every CI job and the Vercel
preview at `npm install` with `ERESOLVE`: `@astrojs/preact@6.0.5` declares `peer preact@"^10.6.5"`.
Nothing in our code was at fault. `--legacy-peer-deps` would have installed it, but that runs Astro's
Preact integration on a major it has not declared support for, and `csp-scripts-pwa.md` treats
`legacy-peer-deps` as a smell. PR #33 was closed and `.github/dependabot.yml` now ignores
`version-update:semver-major` for `preact`.

## Revisit when

**Trigger: `@astrojs/preact` lists preact 11 in its peer range.** Check with:

```bash
npm view @astrojs/preact version peerDependencies
```

Nothing else unblocks this. Our own code does not need the bump, so do not spend time on it before
the trigger. Look at this ticket when you next touch `@astrojs/preact` or Astro's integrations, and
at the latest during any monthly dependency review.

## Acceptance

- Remove the `preact` ignore block from `.github/dependabot.yml` (or let Dependabot reopen the bump).
- On a branch: `npm install` resolves with no `legacy-peer-deps`, then the full CI chain passes,
  including `test:csp` after a real build and preview, and the Playwright projects (islands hydrate).
- `@preact/signals`, `preact-render-to-string` and the prefresh packages resolve to preact-11-compatible
  versions without overrides.
- Update the "Revisit" paragraph in `.claude/rules/csp-scripts-pwa.md` and close this ticket.

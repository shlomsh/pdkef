---
id: "DEBT-37"
title: "A CLI production deploy carries the commit stamp, so its crash reports are not unverifiable"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "now"
depends_on: ["DEBT-35", "DEBT-36"]
---

# DEBT-37 · A CLI production deploy carries the commit stamp

*Filed 2026-10-02, the known gap DEBT-36 left.* A push to `main` is built by Vercel with
`VERCEL_GIT_COMMIT_SHA` set, so its pages carry the commit (DEBT-35). A build made with
`vercel deploy --prod --force` from the CLI has no such variable: it is the path used when a
`patches/` file changes (the push-triggered deploy fails on Vercel's cached `node_modules`), and its
crash reports would read as unstamped, so `errors:read` can only call them unverifiable.

## What to build

`npm run deploy:prod` (`scripts/deploy-prod.mjs`): runs `vercel deploy --prod --force` with
`--build-env VERCEL_GIT_COMMIT_SHA=<HEAD>`, passing any extra arguments through (for example
`--with-cache`). A stamp must name the commit the build was made from, so it refuses on a dirty
working tree, and says so when HEAD is not the tip of `origin/main`. `--dry-run` prints the command
and runs nothing. The pure part (the validation and the argument list) is unit-tested; nothing here
deploys unless a person runs it.

## Acceptance

- [ ] The argument list and the refusals are pure and unit-tested, red first.
- [ ] `npm run deploy:prod -- --dry-run` prints the exact command, with the stamp, from a clean tree.
- [ ] A Vercel build given that variable stamps its pages (`astro.config`/`generate-precache-manifest`
      already read it; checked by building with the same variable).
- [ ] The rule that tells an agent to hand over the `--force` command names this script instead.

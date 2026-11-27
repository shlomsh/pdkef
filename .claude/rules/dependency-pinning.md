---
paths:
  - "package.json"
  - "package-lock.json"
  - "patches/**"
  - "scripts/check-dependency-advisories.mjs"
  - "scripts/verify-dependency-governance.mjs"
  - "docs/dependency-governance.md"
  - ".github/dependabot.yml"
---

# Dependency pinning

Loaded when touching `package.json`, the lockfile, `patches/` or the dependency governance scripts.
The headline is in CLAUDE.md: Astro stays on `^7.0.3`, and anything needing `legacy-peer-deps` is
re-audited first. A dependency that ships or changes a script or style is a CSP change too: see
`csp-scripts-pwa.md`.

## Astro/Vercel version pinning - don't casually upgrade

Astro is pinned to `^7.0.3`, not the `@vite-pwa/astro`-certified `^5.x` line, **on purpose**: `npm audit` showed Astro's own published security advisories (XSS via `define:vars`, slot names, spread props; SSRF) cover every version through `7.0.0-beta`, including all of 5.x. Downgrading to satisfy some other package's peer range would mean shipping a known-vulnerable Astro. If a future dependency wants an older Astro, re-verify with `npm audit` before downgrading — don't assume an older major is safer just because more tooling has caught up to it.


- **`legacy-peer-deps` is a smell, not a fix.** Astro is pinned to `^7.0.3` on purpose (security
  advisories cover every version through 7.0-beta). Any tool that forces `legacy-peer-deps` to install
  must be re-audited against that pin before adoption.

### Preact stays on 10.x (2026-10-05, Dependabot #33)

`@astrojs/preact@6.0.5` peers on `preact@^10.6.5`, so a preact 11 bump fails `npm install` with
`ERESOLVE` and takes every CI job and the Vercel preview down with it. We did not reach for
`--legacy-peer-deps`. `.github/dependabot.yml` ignores preact major updates.

**Revisit when `@astrojs/preact` lists preact 11 in its peer range.** Check with
`npm view @astrojs/preact version peerDependencies`; the ticket that owns this is
[DEBT-40](../../backlog/tasks/DEBT-40.md). When the range admits 11, delete the `preact` entry under
`ignore:` in `dependabot.yml`, run the full CI chain on a branch, and close the ticket. Our code has no
reason to move earlier, so a preact 11 PR before that is noise, not a missed upgrade.

---
id: "SIGN-25"
title: "Reconcile and enforce shipped dependency licenses"
status: "open"
priority: "P1"
epic: "sign-tool-architecture"
phase: "release-blocker"
depends_on: []
legacy_state: "Open — runtime inventory contradicts policy and notices as of 2026-09-03"
---

# SIGN-25 · Reconcile and enforce shipped dependency licenses

## Scope and acceptance

**The written MIT/Apache-only runtime policy and third-party notices do not match the browser
bundle.** `lucide-preact@1.22.0` is ISC-licensed and ships in `createLucideIcon.*.js`; the PDF stack
ships `pako@1.0.11` under MIT/Zlib. `THIRD_PARTY_LICENSES.md` says its runtime list is exhaustive but
omits shipped packages including Lucide, Floating UI, bidi-js, fontkit, and pako, and its Astro/pdf.js
versions already differ from `package-lock.json`. These are primarily permissive licenses, but
silently treating them as MIT/Apache violates the explicit repository policy and makes public
license claims unreliable.

Engineering/product must decide whether the allowlist remains literally MIT/Apache or expands to a
reviewed set of compatible permissive licenses such as ISC, BSD, and Zlib. Do not make that policy
decision implicitly by editing prose. Generate or verify the runtime inventory from the production
bundle plus lockfile, distinguish browser-shipped code from build-only packages, review transitive
obligations, and either replace disallowed packages or record the approved policy change. Bring
`THIRD_PARTY_LICENSES.md`, `/licenses/`, README, and architecture guidance into exact agreement.
Add a CI check that fails on a new unreviewed shipped package/license or stale notice/version while
avoiding false failures from platform-optional and build-only packages.

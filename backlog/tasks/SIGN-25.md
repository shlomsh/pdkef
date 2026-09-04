---
id: "SIGN-25"
title: "Reconcile and enforce shipped dependency licenses"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "release-blocker"
depends_on: []
legacy_state: "Done — reviewed browser runtime inventory and CI guard landed 2026-09-04"
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

**Completed 2026-09-04.** The approved runtime policy is now the deliberately narrow permissive
allowlist: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, Zlib, and 0BSD. It is a reviewed policy,
not a catch-all for open-source code. `scripts/runtime-license-inventory.mjs` names every production
dependency, follows its browser-code transitive closure, and excludes Astro's compiler/dev-server
implementation tree as build-only. It verifies locked versions and package metadata, requires a local
or reviewed upstream notice, and fails if any direct or transitive browser package is not explicitly
listed or carries an unapproved license. It generates the exhaustive runtime-notice block in
`THIRD_PARTY_LICENSES.md` and the static inventory consumed by `/licenses/`; `npm run test:licenses`
runs in CI. README, `llms.txt`, architecture guidance, and public editor copy now describe the same
policy. The checked inventory includes the previously omitted Lucide (ISC), Floating UI, bidi-js,
fontkit, pako (MIT and Zlib), tslib (0BSD), and the current locked `pdfjs-dist` 6.2.108.
